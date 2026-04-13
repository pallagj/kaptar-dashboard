from __future__ import annotations
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import db, init_db, get_setting, set_setting
from .scraper import sync_all
from .scheduler import start_scheduler, reschedule

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()
    yield


app = FastAPI(title="Kaptár Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Hive(BaseModel):
    id: str
    name: str
    source_url: str
    tare_offset: float


class HiveUpdate(BaseModel):
    name: Optional[str] = None
    source_url: Optional[str] = None
    tare_offset: Optional[float] = None


class Flower(BaseModel):
    id: str
    name: str


class SeasonIn(BaseModel):
    hive_id: str
    flower_id: str


class SettingsUpdate(BaseModel):
    sync_interval_minutes: Optional[int] = None
    swarm_alert_kg: Optional[float] = None
    battery_warn_v: Optional[float] = None


@app.get("/api/health")
def health():
    return {"ok": True, "ts": int(time.time() * 1000)}


@app.get("/api/hives")
def list_hives():
    with db() as c:
        rows = c.execute("SELECT id,name,source_url,tare_offset FROM hives ORDER BY name").fetchall()
        return [dict(r) for r in rows]


@app.post("/api/hives")
def create_hive(h: Hive):
    with db() as c:
        try:
            c.execute(
                "INSERT INTO hives(id,name,source_url,tare_offset,created_at) VALUES(?,?,?,?,?)",
                (h.id, h.name, h.source_url, h.tare_offset, int(time.time() * 1000)),
            )
        except Exception as e:
            raise HTTPException(400, str(e))
    return {"ok": True}


@app.patch("/api/hives/{hive_id}")
def update_hive(hive_id: str, upd: HiveUpdate):
    fields, vals = [], []
    for k, v in upd.model_dump(exclude_none=True).items():
        fields.append(f"{k}=?")
        vals.append(v)
    if not fields:
        return {"ok": True}
    vals.append(hive_id)
    with db() as c:
        c.execute(f"UPDATE hives SET {','.join(fields)} WHERE id=?", vals)
    return {"ok": True}


@app.delete("/api/hives/{hive_id}")
def delete_hive(hive_id: str):
    with db() as c:
        c.execute("DELETE FROM measurements WHERE hive_id=?", (hive_id,))
        c.execute("DELETE FROM seasons WHERE hive_id=?", (hive_id,))
        c.execute("DELETE FROM hives WHERE id=?", (hive_id,))
    return {"ok": True}


@app.get("/api/measurements")
def measurements(hive_id: str = "J0102466", since_ms: Optional[int] = None, limit: int = 5000):
    with db() as c:
        if since_ms is not None:
            rows = c.execute(
                "SELECT timestamp,date_str,weight,battery,temp FROM measurements WHERE hive_id=? AND timestamp>=? ORDER BY timestamp DESC LIMIT ?",
                (hive_id, since_ms, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT timestamp,date_str,weight,battery,temp FROM measurements WHERE hive_id=? ORDER BY timestamp DESC LIMIT ?",
                (hive_id, limit),
            ).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/sync")
async def manual_sync():
    res = await sync_all()
    return {"ok": True, "inserted": res}


@app.get("/api/flowers")
def list_flowers():
    with db() as c:
        return [dict(r) for r in c.execute("SELECT id,name FROM flowers ORDER BY name").fetchall()]


@app.post("/api/flowers")
def create_flower(f: Flower):
    with db() as c:
        c.execute("INSERT OR REPLACE INTO flowers(id,name) VALUES(?,?)", (f.id, f.name))
    return {"ok": True}


@app.delete("/api/flowers/{flower_id}")
def delete_flower(flower_id: str):
    with db() as c:
        c.execute("DELETE FROM flowers WHERE id=?", (flower_id,))
    return {"ok": True}


@app.get("/api/seasons")
def list_seasons(hive_id: Optional[str] = None):
    with db() as c:
        if hive_id:
            rows = c.execute(
                "SELECT s.id,s.hive_id,s.flower_id,f.name as flower_name,s.start_ts,s.end_ts,s.start_weight,s.end_weight "
                "FROM seasons s LEFT JOIN flowers f ON f.id=s.flower_id WHERE s.hive_id=? ORDER BY s.start_ts DESC",
                (hive_id,),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT s.id,s.hive_id,s.flower_id,f.name as flower_name,s.start_ts,s.end_ts,s.start_weight,s.end_weight "
                "FROM seasons s LEFT JOIN flowers f ON f.id=s.flower_id ORDER BY s.start_ts DESC"
            ).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/seasons/start")
def start_season(inp: SeasonIn):
    """Close active season (if any) and start a new one using the latest measurement as start weight."""
    with db() as c:
        latest = c.execute(
            "SELECT timestamp,weight FROM measurements WHERE hive_id=? ORDER BY timestamp DESC LIMIT 1",
            (inp.hive_id,),
        ).fetchone()
        if not latest:
            raise HTTPException(400, "Nincs még mért adat ehhez a kaptárhoz.")
        tare = c.execute("SELECT tare_offset FROM hives WHERE id=?", (inp.hive_id,)).fetchone()
        tare_offset = tare["tare_offset"] if tare else 0.0
        net_weight = latest["weight"] - tare_offset
        now_ts = latest["timestamp"]
        # close previous
        c.execute(
            "UPDATE seasons SET end_ts=?, end_weight=? WHERE hive_id=? AND end_ts IS NULL",
            (now_ts, net_weight, inp.hive_id),
        )
        c.execute(
            "INSERT INTO seasons(hive_id,flower_id,start_ts,start_weight) VALUES(?,?,?,?)",
            (inp.hive_id, inp.flower_id, now_ts, net_weight),
        )
    return {"ok": True}


@app.post("/api/seasons/close")
def close_season(hive_id: str):
    with db() as c:
        latest = c.execute(
            "SELECT timestamp,weight FROM measurements WHERE hive_id=? ORDER BY timestamp DESC LIMIT 1",
            (hive_id,),
        ).fetchone()
        if not latest:
            raise HTTPException(400, "Nincs mért adat.")
        tare = c.execute("SELECT tare_offset FROM hives WHERE id=?", (hive_id,)).fetchone()
        tare_offset = tare["tare_offset"] if tare else 0.0
        net_weight = latest["weight"] - tare_offset
        c.execute(
            "UPDATE seasons SET end_ts=?, end_weight=? WHERE hive_id=? AND end_ts IS NULL",
            (latest["timestamp"], net_weight, hive_id),
        )
    return {"ok": True}


@app.delete("/api/seasons/{season_id}")
def delete_season(season_id: int):
    with db() as c:
        c.execute("DELETE FROM seasons WHERE id=?", (season_id,))
    return {"ok": True}


@app.post("/api/tare")
def tare(hive_id: str, target_net_kg: float):
    """Set the tare offset so that the latest measurement reads as target_net_kg net."""
    with db() as c:
        row = c.execute(
            "SELECT weight FROM measurements WHERE hive_id=? ORDER BY timestamp DESC LIMIT 1",
            (hive_id,),
        ).fetchone()
        if not row:
            raise HTTPException(400, "Nincs mért adat.")
        offset = row["weight"] - target_net_kg
        c.execute("UPDATE hives SET tare_offset=? WHERE id=?", (offset, hive_id))
    return {"ok": True, "tare_offset": offset}


@app.get("/api/settings")
def get_settings():
    with db() as c:
        rows = c.execute("SELECT key,value FROM settings").fetchall()
        return {r["key"]: r["value"] for r in rows}


@app.patch("/api/settings")
def update_settings(upd: SettingsUpdate):
    data = upd.model_dump(exclude_none=True)
    for k, v in data.items():
        set_setting(k, str(v))
    if "sync_interval_minutes" in data:
        reschedule(int(data["sync_interval_minutes"]))
    return {"ok": True}


@app.get("/api/stats")
def stats(hive_id: str = "J0102466"):
    """Summary: latest, 24h/7d delta, swarm alerts, daily diffs."""
    with db() as c:
        tare = c.execute("SELECT tare_offset FROM hives WHERE id=?", (hive_id,)).fetchone()
        tare_offset = tare["tare_offset"] if tare else 0.0
        rows = c.execute(
            "SELECT timestamp,date_str,weight,battery,temp FROM measurements WHERE hive_id=? ORDER BY timestamp DESC LIMIT 5000",
            (hive_id,),
        ).fetchall()
        rows = [dict(r) for r in rows]
        for r in rows:
            r["weight"] = round(r["weight"] - tare_offset, 2)

        active = c.execute(
            "SELECT s.*, f.name as flower_name FROM seasons s LEFT JOIN flowers f ON f.id=s.flower_id WHERE s.hive_id=? AND s.end_ts IS NULL ORDER BY s.start_ts DESC LIMIT 1",
            (hive_id,),
        ).fetchone()
        active = dict(active) if active else None

    if not rows:
        return {"latest": None, "history": [], "active_season": active, "tare_offset": tare_offset}

    latest = rows[0]
    now_ts = latest["timestamp"]
    day_ms = 86400 * 1000

    def find_at(age_ms):
        target = now_ts - age_ms
        best = None
        for r in rows:
            if r["timestamp"] <= target:
                best = r
                break
        return best

    d24 = find_at(day_ms)
    d7 = find_at(7 * day_ms)
    d30 = find_at(30 * day_ms)

    # Daily diffs (last measurement per day)
    by_day: dict[str, dict] = {}
    for r in rows:
        day = r["date_str"][:10]
        if day not in by_day or r["timestamp"] > by_day[day]["timestamp"]:
            by_day[day] = r
    days_sorted = sorted(by_day.values(), key=lambda r: r["timestamp"])
    daily_diffs = []
    MAX_GAP_MS = 2 * day_ms  # Ha több mint 2 nap szünet van, nem értelmes napi diff
    for i in range(1, len(days_sorted)):
        gap = days_sorted[i]["timestamp"] - days_sorted[i - 1]["timestamp"]
        if gap > MAX_GAP_MS:
            continue
        daily_diffs.append({
            "date": days_sorted[i]["date_str"][:10],
            "diff": round(days_sorted[i]["weight"] - days_sorted[i - 1]["weight"], 2),
            "timestamp": days_sorted[i]["timestamp"],
        })

    # Swarm detection: sharp single-measurement drop
    swarm_threshold = float(get_setting("swarm_alert_kg", "1.5") or "1.5")
    alerts = []
    MAX_ALERT_GAP_MS = 6 * 3600 * 1000  # Max 6 óra szünet két mérés között
    for i in range(len(rows) - 1):
        gap = rows[i]["timestamp"] - rows[i + 1]["timestamp"]
        if gap > MAX_ALERT_GAP_MS:
            continue
        diff = rows[i]["weight"] - rows[i + 1]["weight"]
        if diff <= -swarm_threshold:
            alerts.append({
                "timestamp": rows[i]["timestamp"],
                "date": rows[i]["date_str"],
                "drop_kg": round(diff, 2),
                "type": "swarm_suspect",
            })
    alerts = alerts[:10]

    return {
        "latest": latest,
        "delta_24h": round(latest["weight"] - d24["weight"], 2) if d24 else None,
        "delta_7d": round(latest["weight"] - d7["weight"], 2) if d7 else None,
        "delta_30d": round(latest["weight"] - d30["weight"], 2) if d30 else None,
        "daily_diffs": daily_diffs[-60:],
        "alerts": alerts,
        "history": rows,
        "active_season": active,
        "tare_offset": tare_offset,
    }
