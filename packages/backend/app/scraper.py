"""Scrape kaptargsm.hu scale HTML pages."""
from __future__ import annotations
import re
import logging
from datetime import datetime
from typing import Dict, List
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup

from .db import db

BUDAPEST_TZ = ZoneInfo("Europe/Budapest")

log = logging.getLogger("kaptar.scraper")

DATE_RE = re.compile(r"(\d{4})\.(\d{2})\.(\d{2})\.\s+(\d{2}):(\d{2}):(\d{2})")


def parse_html(html: str) -> List[Dict]:
    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")
    if not tables:
        return []
    # The last table contains the full measurement list (Dátum, Súly, Akkufesz., Hőfok)
    target = tables[-1]
    rows = target.find_all("tr")
    out: List[Dict] = []
    for tr in rows:
        tds = tr.find_all("td")
        if len(tds) != 4:
            continue
        date_str = tds[0].get_text(strip=True)
        m = DATE_RE.search(date_str)
        if not m:
            continue
        try:
            weight = float(tds[1].get_text(strip=True).replace(",", "."))
            battery = float(tds[2].get_text(strip=True).replace(",", "."))
            temp = float(tds[3].get_text(strip=True).replace(",", "."))
        except ValueError:
            continue
        if weight < 5.0:
            continue
        y, mo, d, h, mi, s = map(int, m.groups())
        ts = int(datetime(y, mo, d, h, mi, s, tzinfo=BUDAPEST_TZ).timestamp() * 1000)
        out.append({
            "timestamp": ts,
            "date_str": date_str,
            "weight": weight,
            "battery": battery,
            "temp": temp,
        })
    return out


async def fetch_and_store(scale_id: str) -> int:
    """Fetch HTML, parse, store new rows for a kaptargsm scale. Returns inserted count."""
    with db() as c:
        row = c.execute(
            "SELECT user_id, source_url, source_type FROM scales WHERE id=?", (scale_id,)
        ).fetchone()
    if not row or row["source_type"] != "kaptargsm" or not row["source_url"]:
        return 0
    user_id = row["user_id"]
    url = row["source_url"]

    try:
        async with httpx.AsyncClient(timeout=20.0, headers={"User-Agent": "kaptar-dashboard/1.0"}) as client:
            r = await client.get(url)
            r.raise_for_status()
            html = r.text
    except Exception as e:
        log.warning("fetch failed for %s (%s): %s", scale_id, url, e)
        return 0

    rows = parse_html(html)
    if not rows:
        return 0

    inserted_ts: list[int] = []
    with db() as c:
        for row in rows:
            cur = c.execute(
                "INSERT OR IGNORE INTO measurements(timestamp,date_str,weight,battery,temp,scale_id) "
                "VALUES(?,?,?,?,?,?)",
                (row["timestamp"], row["date_str"], row["weight"], row["battery"], row["temp"], scale_id),
            )
            if cur.rowcount:
                inserted_ts.append(row["timestamp"])
    log.info("scale %s: fetched %d rows, inserted %d new", scale_id, len(rows), len(inserted_ts))

    if inserted_ts:
        try:
            _check_alerts_and_notify(scale_id, user_id, inserted_ts)
        except Exception as e:
            log.warning("alert check failed: %s", e)

    return len(inserted_ts)


def _check_alerts_and_notify(scale_id: str, user_id: int, new_timestamps: list[int]) -> None:
    """Send a push notification to the scale owner on a sharp drop in any newly-ingested rows."""
    from .db import get_user_setting
    from .tare import list_events as tare_list, apply_offsets
    from . import push

    threshold = float(get_user_setting(user_id, "swarm_alert_kg", "1.5") or "1.5")
    MAX_GAP_MS = 6 * 3600 * 1000

    with db() as c:
        events = tare_list(c, scale_id)
        for ts in sorted(new_timestamps, reverse=True):
            pair = c.execute(
                "SELECT timestamp,date_str,weight FROM measurements WHERE scale_id=? AND timestamp<=? "
                "ORDER BY timestamp DESC LIMIT 2",
                (scale_id, ts),
            ).fetchall()
            if len(pair) < 2:
                continue
            rows = [dict(p) for p in pair]
            apply_offsets(events, rows)
            latest, prev = rows[0], rows[1]
            gap = latest["timestamp"] - prev["timestamp"]
            if gap > MAX_GAP_MS:
                continue
            drop = prev["weight"] - latest["weight"]
            if drop >= threshold:
                title = "🐝 Lehetséges rajzás!"
                body = f"{latest['date_str']}: −{drop:.2f} kg egyetlen mérés alatt"
                push.send_to_user(user_id, title, body, tag=f"swarm-{ts}", url=f"/scale/{scale_id}")


async def sync_for_user(user_id: int) -> Dict[str, int]:
    """Sync all kaptargsm scales owned by one user."""
    with db() as c:
        scales = c.execute(
            "SELECT id FROM scales WHERE user_id=? AND source_type='kaptargsm'", (user_id,)
        ).fetchall()
    result = {}
    for s in scales:
        result[s["id"]] = await fetch_and_store(s["id"])
    return result


async def sync_all_users() -> Dict[str, int]:
    """Sync every kaptargsm scale across all users (used by the scheduler)."""
    with db() as c:
        scales = c.execute(
            "SELECT id FROM scales WHERE source_type='kaptargsm'"
        ).fetchall()
    result = {}
    for s in scales:
        result[s["id"]] = await fetch_and_store(s["id"])
    return result
