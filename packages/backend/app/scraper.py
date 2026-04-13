"""Scrape kaptargsm.hu scale HTML pages."""
from __future__ import annotations
import re
import logging
from datetime import datetime
from typing import List, Dict
from zoneinfo import ZoneInfo

BUDAPEST_TZ = ZoneInfo("Europe/Budapest")

import httpx
from bs4 import BeautifulSoup

from .db import db

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
        # Skip sensor glitches: negative weight or absurdly low value (scale disconnected)
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


async def fetch_and_store(hive_id: str, url: str) -> int:
    """Fetch HTML, parse, store new rows. Returns number inserted."""
    try:
        async with httpx.AsyncClient(timeout=20.0, headers={"User-Agent": "kaptar-dashboard/1.0"}) as client:
            r = await client.get(url)
            r.raise_for_status()
            html = r.text
    except Exception as e:
        log.warning("fetch failed for %s: %s", url, e)
        return 0

    rows = parse_html(html)
    if not rows:
        return 0

    inserted_ts: list[int] = []
    with db() as c:
        for row in rows:
            cur = c.execute(
                "INSERT OR IGNORE INTO measurements(timestamp,date_str,weight,battery,temp,hive_id) VALUES(?,?,?,?,?,?)",
                (row["timestamp"], row["date_str"], row["weight"], row["battery"], row["temp"], hive_id),
            )
            if cur.rowcount:
                inserted_ts.append(row["timestamp"])
    log.info("hive %s: fetched %d rows, inserted %d new", hive_id, len(rows), len(inserted_ts))

    if inserted_ts:
        try:
            _check_alerts_and_notify(hive_id, inserted_ts)
        except Exception as e:
            log.warning("alert check failed: %s", e)

    return len(inserted_ts)


def _check_alerts_and_notify(hive_id: str, new_timestamps: list[int]) -> None:
    """For each newly-inserted measurement, check if it forms a sharp drop against the
    immediately-preceding row. If yes, send a push notification."""
    from .db import get_setting
    from .tare import list_events as tare_list, apply_offsets
    from . import push

    threshold = float(get_setting("swarm_alert_kg", "1.5") or "1.5")
    MAX_GAP_MS = 6 * 3600 * 1000  # only meaningful if prev measurement was within 6h

    with db() as c:
        events = tare_list(c, hive_id)
        for ts in sorted(new_timestamps, reverse=True):
            # latest row at or before `ts`, and the one before it
            pair = c.execute(
                "SELECT timestamp,date_str,weight FROM measurements WHERE hive_id=? AND timestamp<=? "
                "ORDER BY timestamp DESC LIMIT 2",
                (hive_id, ts),
            ).fetchall()
            if len(pair) < 2:
                continue
            rows = [dict(p) for p in pair]
            apply_offsets(events, rows)  # net
            latest, prev = rows[0], rows[1]
            gap = latest["timestamp"] - prev["timestamp"]
            if gap > MAX_GAP_MS:
                continue
            drop = prev["weight"] - latest["weight"]
            if drop >= threshold:
                title = "🐝 Lehetséges rajzás!"
                body = f"{latest['date_str']}: −{drop:.2f} kg egyetlen mérés alatt"
                push.send(title, body, tag=f"swarm-{ts}", url="/")


async def sync_all() -> Dict[str, int]:
    from .db import db as _db
    with _db() as c:
        hives = c.execute("SELECT id, source_url FROM hives").fetchall()
    result = {}
    for h in hives:
        result[h["id"]] = await fetch_and_store(h["id"], h["source_url"])
    return result
