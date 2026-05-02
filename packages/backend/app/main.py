from __future__ import annotations
import logging
import os
import secrets
import sqlite3
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import db, init_db, get_setting, set_setting, get_user_setting, set_user_setting, seed_user_defaults
from .scraper import sync_for_user
from .scheduler import start_scheduler
from .tare import list_events as tare_list, effective_offset, apply_offsets
from .auth import (
    verify_google_id_token,
    upsert_user_from_google,
    issue_session_jwt,
    current_user,
    current_user_by_ingest_token,
)
from .sms import parse_sms
from . import push

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


# ─────────── Pydantic models ───────────

class GoogleLoginIn(BaseModel):
    id_token: str


class ScaleIn(BaseModel):
    id: str
    name: str
    source_type: str = "kaptargsm"  # kaptargsm | sms | manual
    source_url: Optional[str] = None
    phone_number: Optional[str] = None
    sms_template: Optional[str] = None
    call_trigger: bool = False
    battery_unit: str = "V"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None


class ScaleUpdate(BaseModel):
    name: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    phone_number: Optional[str] = None
    sms_template: Optional[str] = None
    call_trigger: Optional[bool] = None
    battery_unit: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None


class Flower(BaseModel):
    id: str
    name: str


class SeasonStartIn(BaseModel):
    scale_id: str
    flower_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None


class SettingsUpdate(BaseModel):
    sync_interval_minutes: Optional[int] = None
    swarm_alert_kg: Optional[float] = None
    battery_warn_v: Optional[float] = None
    battery_warn_pct: Optional[float] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    shortcut_link_url: Optional[str] = None


class PushSubscribeIn(BaseModel):
    endpoint: str
    keys: dict


class SmsIngestIn(BaseModel):
    sender: str
    content: str
    recipients: list[str] = []


# ─────────── Helpers ───────────

def _require_scale(c, user_id: int, scale_id: str) -> dict:
    row = c.execute(
        "SELECT * FROM scales WHERE id=? AND user_id=?", (scale_id, user_id)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Mérleg nem található")
    return dict(row)


def _public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "picture": u.get("picture"),
        "phone": u.get("phone"),
        "ingest_token": u["ingest_token"],
        "shortcut_link_url": u.get("shortcut_link_url"),
    }


# ─────────── Public / auth ───────────

@app.get("/api/health")
def health():
    return {"ok": True, "ts": int(time.time() * 1000)}


@app.get("/api/auth/config")
def auth_config():
    """Public config the login page needs (Google OAuth client id)."""
    cid = os.environ.get("GOOGLE_CLIENT_ID") or get_setting("google_client_id")
    return {"google_client_id": cid or ""}


@app.post("/api/auth/google")
def auth_google(inp: GoogleLoginIn):
    info = verify_google_id_token(inp.id_token)
    user = upsert_user_from_google(info)
    token = issue_session_jwt(user["id"])
    return {"token": token, "user": _public_user(user)}


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(current_user)):
    return _public_user(user)


# ─────────── Scales ───────────

@app.get("/api/scales")
def list_scales(user: dict = Depends(current_user)):
    """Return the user's scales along with a card-sized summary for the Home grid."""
    day_ms = 86400 * 1000
    with db() as c:
        rows = c.execute(
            "SELECT * FROM scales WHERE user_id=? ORDER BY name", (user["id"],)
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            scale_id = d["id"]
            latest_row = c.execute(
                "SELECT timestamp, weight, battery, temp FROM measurements "
                "WHERE scale_id=? ORDER BY timestamp DESC LIMIT 1",
                (scale_id,),
            ).fetchone()
            if latest_row:
                latest = dict(latest_row)
                events = tare_list(c, scale_id)
                net_rows = [dict(latest)]
                apply_offsets(events, net_rows)
                latest_net = net_rows[0]["weight"]
                d24_row = c.execute(
                    "SELECT timestamp, weight FROM measurements WHERE scale_id=? AND timestamp<=? "
                    "ORDER BY timestamp DESC LIMIT 1",
                    (scale_id, latest["timestamp"] - day_ms),
                ).fetchone()
                delta_24h = None
                if d24_row:
                    d24 = dict(d24_row)
                    apply_offsets(events, [d24])
                    delta_24h = round(latest_net - d24["weight"], 2)
                d["tare_offset"] = effective_offset(c, scale_id, latest["timestamp"])
            else:
                latest = None
                latest_net = None
                delta_24h = None
                d["tare_offset"] = 0.0

            active = c.execute(
                "SELECT s.flower_id, f.name as flower_name, s.start_ts, s.start_weight "
                "FROM seasons s LEFT JOIN flowers f ON f.id=s.flower_id AND f.user_id=? "
                "WHERE s.scale_id=? AND s.end_ts IS NULL "
                "ORDER BY s.start_ts DESC LIMIT 1",
                (user["id"], scale_id),
            ).fetchone()

            d["summary"] = {
                "latest_weight_net": latest_net,
                "latest_timestamp": latest["timestamp"] if latest else None,
                "battery": latest["battery"] if latest else None,
                "temp": latest["temp"] if latest else None,
                "delta_24h": delta_24h,
                "active_season": dict(active) if active else None,
            }
            out.append(d)
        return out


@app.post("/api/scales")
def create_scale(s: ScaleIn, user: dict = Depends(current_user)):
    if s.source_type not in ("kaptargsm", "sms", "manual"):
        raise HTTPException(400, "Ismeretlen source_type")
    with db() as c:
        try:
            c.execute(
                "INSERT INTO scales(id, user_id, name, source_type, source_url, phone_number, "
                "sms_template, call_trigger, latitude, longitude, location_name, created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (s.id, user["id"], s.name, s.source_type, s.source_url, s.phone_number,
                 s.sms_template, int(s.call_trigger),
                 s.latitude, s.longitude, s.location_name, int(time.time() * 1000)),
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(400, f"Ilyen ID már foglalt: {e}")
    return {"ok": True}


@app.patch("/api/scales/{scale_id}")
def update_scale(scale_id: str, upd: ScaleUpdate, user: dict = Depends(current_user)):
    fields, vals = [], []
    for k, v in upd.model_dump(exclude_none=True).items():
        fields.append(f"{k}=?")
        vals.append(v)
    with db() as c:
        _require_scale(c, user["id"], scale_id)
        if fields:
            vals.extend([scale_id, user["id"]])
            c.execute(f"UPDATE scales SET {','.join(fields)} WHERE id=? AND user_id=?", vals)
    return {"ok": True}


@app.delete("/api/scales/{scale_id}")
def delete_scale(scale_id: str, user: dict = Depends(current_user)):
    with db() as c:
        _require_scale(c, user["id"], scale_id)
        c.execute("DELETE FROM measurements WHERE scale_id=?", (scale_id,))
        c.execute("DELETE FROM seasons WHERE scale_id=?", (scale_id,))
        c.execute("DELETE FROM tare_events WHERE scale_id=?", (scale_id,))
        c.execute("DELETE FROM scales WHERE id=? AND user_id=?", (scale_id, user["id"]))
    return {"ok": True}


# ─────────── SMS ingest (iPhone Shortcuts) ───────────

@app.post("/api/ingest/sms")
def ingest_sms(inp: SmsIngestIn, user: dict = Depends(current_user_by_ingest_token)):
    sender = inp.sender.strip()
    with db() as c:
        row = c.execute(
            "SELECT * FROM scales WHERE user_id=? AND phone_number=? AND source_type='sms'",
            (user["id"], sender),
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Nincs SMS-mérleg ehhez a feladóhoz: {sender}")
        scale = dict(row)
        parsed = parse_sms(inp.content, scale.get("sms_template"))
        if not parsed:
            raise HTTPException(422, "Az SMS tartalmából nem sikerült adatot kinyerni")
        ts = int(time.time() * 1000)
        from datetime import datetime
        from zoneinfo import ZoneInfo
        date_str = datetime.fromtimestamp(ts / 1000, tz=ZoneInfo("Europe/Budapest")).strftime("%Y.%m.%d. %H:%M:%S")
        c.execute(
            "INSERT OR REPLACE INTO measurements(timestamp, date_str, weight, battery, temp, scale_id) "
            "VALUES(?,?,?,?,?,?)",
            (ts, date_str,
             round(parsed["weight"], 2),
             round(parsed.get("battery", 0.0), 2),
             round(parsed.get("temp", 0.0), 2),
             scale["id"]),
        )
    log = logging.getLogger("kaptar.ingest")
    log.info("SMS ingest: user=%d scale=%s weight=%.2f", user["id"], scale["id"], parsed["weight"])
    return {"ok": True, "scale_id": scale["id"], "weight": parsed["weight"]}


# ─────────── Measurements ───────────

@app.get("/api/measurements")
def measurements(scale_id: str, since_ms: Optional[int] = None, limit: int = 5000,
                 user: dict = Depends(current_user)):
    with db() as c:
        _require_scale(c, user["id"], scale_id)
        if since_ms is not None:
            rows = c.execute(
                "SELECT timestamp,date_str,weight,battery,temp FROM measurements "
                "WHERE scale_id=? AND timestamp>=? ORDER BY timestamp DESC LIMIT ?",
                (scale_id, since_ms, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT timestamp,date_str,weight,battery,temp FROM measurements "
                "WHERE scale_id=? ORDER BY timestamp DESC LIMIT ?",
                (scale_id, limit),
            ).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/measurements")
def add_measurement(
    scale_id: str,
    weight: float,
    temp: float = 0.0,
    battery: float = 0.0,
    timestamp_ms: Optional[int] = None,
    user: dict = Depends(current_user),
):
    with db() as c:
        scale = _require_scale(c, user["id"], scale_id)
        if scale["source_type"] not in ("manual", "sms"):
            raise HTTPException(400, "Csak manuális/SMS mérlegnél vihető be adat kézzel")
        ts = timestamp_ms if timestamp_ms else int(time.time() * 1000)
        from datetime import datetime
        from zoneinfo import ZoneInfo
        date_str = datetime.fromtimestamp(ts / 1000, tz=ZoneInfo("Europe/Budapest")).strftime("%Y.%m.%d. %H:%M:%S")
        c.execute(
            "INSERT OR REPLACE INTO measurements(timestamp,date_str,weight,battery,temp,scale_id) "
            "VALUES(?,?,?,?,?,?)",
            (ts, date_str, round(weight, 2), round(battery, 2), round(temp, 2), scale_id),
        )
    return {"ok": True}


@app.post("/api/sync")
async def manual_sync(user: dict = Depends(current_user)):
    res = await sync_for_user(user["id"])
    return {"ok": True, "inserted": res}


# ─────────── Flowers (global catalog) ───────────

@app.get("/api/flowers")
def list_flowers(user: dict = Depends(current_user)):
    with db() as c:
        return [dict(r) for r in c.execute(
            "SELECT id,name FROM flowers WHERE user_id=? ORDER BY name", (user["id"],)
        ).fetchall()]


@app.post("/api/flowers")
def create_flower(f: Flower, user: dict = Depends(current_user)):
    with db() as c:
        c.execute("INSERT OR REPLACE INTO flowers(user_id,id,name) VALUES(?,?,?)", (user["id"], f.id, f.name))
    return {"ok": True}


@app.delete("/api/flowers/{flower_id}")
def delete_flower(flower_id: str, user: dict = Depends(current_user)):
    with db() as c:
        c.execute("DELETE FROM flowers WHERE user_id=? AND id=?", (user["id"], flower_id))
    return {"ok": True}


# ─────────── Seasons ───────────

@app.get("/api/seasons")
def list_seasons(scale_id: str, user: dict = Depends(current_user)):
    with db() as c:
        _require_scale(c, user["id"], scale_id)
        rows = c.execute(
            "SELECT s.id,s.scale_id,s.flower_id,f.name as flower_name,s.start_ts,s.end_ts,"
            "s.start_weight,s.end_weight,s.latitude,s.longitude,s.location_name "
            "FROM seasons s LEFT JOIN flowers f ON f.id=s.flower_id AND f.user_id=? "
            "WHERE s.scale_id=? ORDER BY s.start_ts DESC",
            (user["id"], scale_id),
        ).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/seasons/start")
def start_season(inp: SeasonStartIn, user: dict = Depends(current_user)):
    with db() as c:
        _require_scale(c, user["id"], inp.scale_id)
        latest = c.execute(
            "SELECT timestamp,weight FROM measurements WHERE scale_id=? "
            "ORDER BY timestamp DESC LIMIT 1",
            (inp.scale_id,),
        ).fetchone()
        if not latest:
            raise HTTPException(400, "Nincs még mért adat ehhez a mérleghez.")
        tare_offset = effective_offset(c, inp.scale_id, latest["timestamp"])
        net_weight = round(latest["weight"] - tare_offset, 2)
        now_ts = latest["timestamp"]
        c.execute(
            "UPDATE seasons SET end_ts=?, end_weight=? WHERE scale_id=? AND end_ts IS NULL",
            (now_ts, net_weight, inp.scale_id),
        )
        c.execute(
            "INSERT INTO seasons(scale_id, flower_id, start_ts, start_weight, "
            "latitude, longitude, location_name) VALUES(?,?,?,?,?,?,?)",
            (inp.scale_id, inp.flower_id, now_ts, net_weight,
             inp.latitude, inp.longitude, inp.location_name),
        )
    return {"ok": True}


@app.post("/api/seasons/close")
def close_season(scale_id: str, user: dict = Depends(current_user)):
    with db() as c:
        _require_scale(c, user["id"], scale_id)
        latest = c.execute(
            "SELECT timestamp,weight FROM measurements WHERE scale_id=? ORDER BY timestamp DESC LIMIT 1",
            (scale_id,),
        ).fetchone()
        if not latest:
            raise HTTPException(400, "Nincs mért adat.")
        tare_offset = effective_offset(c, scale_id, latest["timestamp"])
        net_weight = round(latest["weight"] - tare_offset, 2)
        c.execute(
            "UPDATE seasons SET end_ts=?, end_weight=? WHERE scale_id=? AND end_ts IS NULL",
            (latest["timestamp"], net_weight, scale_id),
        )
    return {"ok": True}


@app.delete("/api/seasons/{season_id}")
def delete_season(season_id: int, user: dict = Depends(current_user)):
    with db() as c:
        row = c.execute(
            "SELECT s.id FROM seasons s JOIN scales sc ON sc.id=s.scale_id "
            "WHERE s.id=? AND sc.user_id=?",
            (season_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Szezon nem található")
        c.execute("DELETE FROM seasons WHERE id=?", (season_id,))
    return {"ok": True}


# ─────────── Tare ───────────

@app.post("/api/tare")
def tare(
    scale_id: str,
    pre_raw_kg: float,
    post_raw_kg: float,
    target_net_kg: Optional[float] = None,
    note: Optional[str] = None,
    user: dict = Depends(current_user),
):
    now = int(time.time() * 1000)
    with db() as c:
        _require_scale(c, user["id"], scale_id)
        row = c.execute(
            "SELECT timestamp FROM measurements WHERE scale_id=? ORDER BY timestamp DESC LIMIT 1",
            (scale_id,),
        ).fetchone()
        if not row:
            raise HTTPException(400, "Nincs mért adat.")
        old_offset = effective_offset(c, scale_id, int(row["timestamp"]))
        pre_net = round(float(pre_raw_kg) - old_offset, 2)
        target_net = float(target_net_kg) if target_net_kg is not None else pre_net
        offset = round(float(post_raw_kg) - target_net, 2)
        event_ts = max(int(row["timestamp"]) + 1, now)
        c.execute(
            "INSERT INTO tare_events(scale_id, timestamp, offset, target_net, note, created_at) "
            "VALUES(?,?,?,?,?,?)",
            (scale_id, event_ts, offset, target_net, note, now),
        )
    return {"ok": True, "tare_offset": offset, "target_net": target_net, "pre_net": pre_net}


@app.get("/api/tare-events")
def list_tare_events(scale_id: str, user: dict = Depends(current_user)):
    with db() as c:
        _require_scale(c, user["id"], scale_id)
        return tare_list(c, scale_id)


@app.delete("/api/tare-events/{event_id}")
def delete_tare_event(event_id: int, user: dict = Depends(current_user)):
    with db() as c:
        row = c.execute(
            "SELECT te.id FROM tare_events te JOIN scales sc ON sc.id=te.scale_id "
            "WHERE te.id=? AND sc.user_id=?",
            (event_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Tára-esemény nem található")
        c.execute("DELETE FROM tare_events WHERE id=?", (event_id,))
    return {"ok": True}


# ─────────── Push ───────────

@app.get("/api/push/vapid-public-key")
def push_vapid_public_key():
    return {"key": push.public_key_b64()}


@app.post("/api/push/subscribe")
def push_subscribe(sub: PushSubscribeIn, user: dict = Depends(current_user)):
    push.add_subscription(user["id"], sub.endpoint, sub.keys)
    return {"ok": True}


@app.post("/api/push/unsubscribe")
def push_unsubscribe(sub: PushSubscribeIn, user: dict = Depends(current_user)):
    push.remove_subscription(sub.endpoint)
    return {"ok": True}


@app.post("/api/push/test")
def push_test(user: dict = Depends(current_user)):
    sent = push.send_to_user(user["id"], "🐝 Teszt értesítés",
                              "Ha ezt látod, működik a push.", tag="test")
    return {"ok": True, "sent": sent}


# ─────────── Settings & account ───────────

_SETTINGS_PRIVATE = {
    "vapid_private_pem", "vapid_private_b64", "vapid_public_b64",
    "jwt_secret", "google_client_id",
}


@app.get("/api/settings")
def get_settings(user: dict = Depends(current_user)):
    uid = user["id"]
    return {
        "sync_interval_minutes": get_user_setting(uid, "sync_interval_minutes", "30"),
        "swarm_alert_kg":        get_user_setting(uid, "swarm_alert_kg", "1.5"),
        "battery_warn_v":        get_user_setting(uid, "battery_warn_v", "5.6"),
        "battery_warn_pct":      get_user_setting(uid, "battery_warn_pct", "20"),
    }


@app.patch("/api/settings")
def update_settings(upd: SettingsUpdate, user: dict = Depends(current_user)):
    for k, v in upd.model_dump(exclude_none=True).items():
        set_user_setting(user["id"], k, str(v))
    return {"ok": True}


@app.patch("/api/account")
def update_account(upd: AccountUpdate, user: dict = Depends(current_user)):
    fields, vals = [], []
    for k, v in upd.model_dump(exclude_none=True).items():
        fields.append(f"{k}=?")
        vals.append(v)
    if not fields:
        return {"ok": True}
    vals.append(user["id"])
    with db() as c:
        c.execute(f"UPDATE users SET {','.join(fields)} WHERE id=?", vals)
    return {"ok": True}


@app.post("/api/account/rotate-ingest-token")
def rotate_ingest_token(user: dict = Depends(current_user)):
    new_token = secrets.token_urlsafe(32)
    with db() as c:
        c.execute("UPDATE users SET ingest_token=? WHERE id=?", (new_token, user["id"]))
    return {"ingest_token": new_token}


# ─────────── Admin ───────────

SUPERADMIN_EMAIL = "pallagj@gmail.com"


def _require_superadmin(user: dict):
    if user["email"] != SUPERADMIN_EMAIL:
        raise HTTPException(403, "Nincs jogosultság")


@app.get("/api/admin/users")
def admin_list_users(user: dict = Depends(current_user)):
    _require_superadmin(user)
    with db() as c:
        rows = c.execute("SELECT id, email, name FROM users ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/admin/impersonate")
def admin_impersonate(target_id: int, user: dict = Depends(current_user)):
    _require_superadmin(user)
    with db() as c:
        target = c.execute("SELECT * FROM users WHERE id=?", (target_id,)).fetchone()
        if not target:
            raise HTTPException(404, "Felhasználó nem található")
    token = issue_session_jwt(target_id)
    return {"token": token, "user": _public_user(dict(target))}


# ─────────── Stats (full per-scale dashboard payload) ───────────

@app.get("/api/stats")
def stats(scale_id: str, user: dict = Depends(current_user)):
    with db() as c:
        _require_scale(c, user["id"], scale_id)
        events = tare_list(c, scale_id)
        rows = c.execute(
            "SELECT timestamp,date_str,weight,battery,temp FROM measurements WHERE scale_id=? "
            "ORDER BY timestamp DESC LIMIT 5000",
            (scale_id,),
        ).fetchall()
        rows = [dict(r) for r in rows]
        raw_latest = rows[0]["weight"] if rows else None
        apply_offsets(events, rows)
        tare_offset = float(events[-1]["offset"]) if events else 0.0

        active = c.execute(
            "SELECT s.*, f.name as flower_name FROM seasons s LEFT JOIN flowers f ON f.id=s.flower_id AND f.user_id=? "
            "WHERE s.scale_id=? AND s.end_ts IS NULL ORDER BY s.start_ts DESC LIMIT 1",
            (user["id"], scale_id),
        ).fetchone()
        active = dict(active) if active else None

    if not rows:
        return {
            "latest": None, "latest_raw": None, "history": [], "active_season": active,
            "tare_offset": tare_offset, "tare_events": events,
            "delta_24h": None, "delta_7d": None, "delta_30d": None,
            "daily_diffs": [], "alerts": [],
        }

    latest = rows[0]
    now_ts = latest["timestamp"]
    latest_raw = round(raw_latest, 2) if raw_latest is not None else None
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

    by_day: dict[str, dict] = {}
    for r in rows:
        day = r["date_str"][:10]
        if day not in by_day or r["timestamp"] > by_day[day]["timestamp"]:
            by_day[day] = r
    days_sorted = sorted(by_day.values(), key=lambda r: r["timestamp"])
    daily_diffs = []
    MAX_GAP_MS = 2 * day_ms
    for i in range(1, len(days_sorted)):
        gap = days_sorted[i]["timestamp"] - days_sorted[i - 1]["timestamp"]
        if gap > MAX_GAP_MS:
            continue
        daily_diffs.append({
            "date": days_sorted[i]["date_str"][:10],
            "diff": round(days_sorted[i]["weight"] - days_sorted[i - 1]["weight"], 2),
            "timestamp": days_sorted[i]["timestamp"],
        })

    swarm_threshold = float(get_user_setting(user["id"], "swarm_alert_kg", "1.5") or "1.5")
    alerts = []
    MAX_ALERT_GAP_MS = 6 * 3600 * 1000
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
        "tare_events": events,
        "latest_raw": latest_raw,
    }
