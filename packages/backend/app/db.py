import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(os.environ.get("KAPTAR_DB", Path(__file__).resolve().parent.parent / "data.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS measurements (
    timestamp INTEGER PRIMARY KEY,
    date_str  TEXT NOT NULL,
    weight    REAL NOT NULL,
    battery   REAL NOT NULL,
    temp      REAL NOT NULL,
    hive_id   TEXT NOT NULL DEFAULT 'J0102466'
);
CREATE INDEX IF NOT EXISTS idx_measurements_hive_ts ON measurements(hive_id, timestamp);

CREATE TABLE IF NOT EXISTS hives (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    source_url  TEXT NOT NULL,
    tare_offset REAL NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flowers (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seasons (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    hive_id       TEXT NOT NULL,
    flower_id     TEXT NOT NULL,
    start_ts      INTEGER NOT NULL,
    end_ts        INTEGER,
    start_weight  REAL NOT NULL,
    end_weight    REAL
);
CREATE INDEX IF NOT EXISTS idx_seasons_hive ON seasons(hive_id, start_ts);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tare_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    hive_id    TEXT NOT NULL,
    timestamp  INTEGER NOT NULL,
    offset     REAL NOT NULL,
    target_net REAL,
    note       TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tare_events_hive_ts ON tare_events(hive_id, timestamp);
"""

DEFAULT_SETTINGS = {
    "sync_interval_minutes": "30",
    "swarm_alert_kg": "1.5",
    "battery_warn_v": "5.6",
}

DEFAULT_FLOWERS = [
    ("akac", "Akác"),
    ("repce", "Repce"),
    ("napraforgo", "Napraforgó"),
    ("hars", "Hárs"),
    ("selyemkoro", "Selyemkóró"),
    ("vegyes", "Vegyes virág"),
    ("gesztenye", "Gesztenye"),
    ("facelia", "Facélia"),
]


def _conn():
    c = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA foreign_keys=ON")
    return c


@contextmanager
def db():
    c = _conn()
    try:
        yield c
    finally:
        c.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as c:
        c.executescript(SCHEMA)
        import time
        now = int(time.time() * 1000)
        c.execute(
            "INSERT OR IGNORE INTO hives(id,name,source_url,tare_offset,created_at) VALUES(?,?,?,?,?)",
            ("J0102466", "Tesó kaptára", "https://www.kaptargsm.hu/scale/J0102466.php", 0.0, now),
        )
        for k, v in DEFAULT_SETTINGS.items():
            c.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", (k, v))
        for fid, name in DEFAULT_FLOWERS:
            c.execute("INSERT OR IGNORE INTO flowers(id,name) VALUES(?,?)", (fid, name))
        # Takarítás: szenzor-hibás mérések (súly < 5 kg) kidobása
        c.execute("DELETE FROM measurements WHERE weight < 5.0")
        # Migráció: ha volt régi hives.tare_offset, amit még nem rögzítettünk eseményként,
        # készítsünk kezdő tára-eseményt a legkorábbi mérés idejére (így a múlt képe nem változik).
        hives_rows = c.execute("SELECT id, tare_offset FROM hives WHERE tare_offset != 0").fetchall()
        for h in hives_rows:
            has_event = c.execute(
                "SELECT 1 FROM tare_events WHERE hive_id=? LIMIT 1", (h["id"],)
            ).fetchone()
            if has_event:
                continue
            first = c.execute(
                "SELECT MIN(timestamp) as ts FROM measurements WHERE hive_id=?", (h["id"],)
            ).fetchone()
            ts = first["ts"] if first and first["ts"] is not None else now
            c.execute(
                "INSERT INTO tare_events(hive_id,timestamp,offset,target_net,note,created_at) VALUES(?,?,?,?,?,?)",
                (h["id"], ts, h["tare_offset"], None, "Migrált a régi hives.tare_offset-ből", now),
            )


def get_setting(key: str, default: str | None = None) -> str | None:
    with db() as c:
        row = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str):
    with db() as c:
        c.execute(
            "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
