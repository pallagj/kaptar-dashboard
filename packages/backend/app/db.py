import sqlite3
import os
import secrets
import time
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(os.environ.get("KAPTAR_DB", Path(__file__).resolve().parent.parent / "data.db"))

# Default beekeeper account to which any legacy data gets attached.
DEFAULT_OWNER_EMAIL = "pallagroland@gmail.com"
DEFAULT_OWNER_NAME = "Roland Pallag"

DEFAULT_SETTINGS: dict[str, str] = {}  # no global user-facing settings remain

DEFAULT_USER_SETTINGS = {
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


def _table_exists(c, name: str) -> bool:
    return bool(c.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone())


def _column_exists(c, table: str, column: str) -> bool:
    return bool(c.execute(
        f"SELECT 1 FROM pragma_table_info('{table}') WHERE name=?", (column,)
    ).fetchone())


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as c:
        # Core always-present tables. Created before the migration so Roland's
        # user id is available to attach legacy data to.
        c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub        TEXT UNIQUE,
                email             TEXT NOT NULL UNIQUE,
                name              TEXT NOT NULL DEFAULT '',
                picture           TEXT,
                phone             TEXT,
                ingest_token      TEXT NOT NULL UNIQUE,
                shortcut_link_url TEXT,
                created_at        INTEGER NOT NULL
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS flowers (
                id   TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS friendships (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                requester_id  INTEGER NOT NULL,
                addressee_id  INTEGER NOT NULL,
                status        TEXT NOT NULL DEFAULT 'pending',
                created_at    INTEGER NOT NULL,
                responded_at  INTEGER,
                UNIQUE(requester_id, addressee_id),
                FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(addressee_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id)")

        now = int(time.time() * 1000)

        # Seed the default owner (Roland) — existing data belongs to him.
        c.execute(
            "INSERT OR IGNORE INTO users(email, name, ingest_token, created_at) VALUES(?,?,?,?)",
            (DEFAULT_OWNER_EMAIL, DEFAULT_OWNER_NAME, secrets.token_urlsafe(32), now),
        )
        owner_id = c.execute("SELECT id FROM users WHERE email=?", (DEFAULT_OWNER_EMAIL,)).fetchone()["id"]

        # One-shot migration from the pre-multi-user schema (hives → scales,
        # hive_id → scale_id, composite PK on measurements).
        if _table_exists(c, "hives") and not _table_exists(c, "scales"):
            _migrate_hives_to_scales(c, owner_id)

        # New-schema tables (fresh install or post-migration).
        c.execute("""
            CREATE TABLE IF NOT EXISTS scales (
                id            TEXT PRIMARY KEY,
                user_id       INTEGER NOT NULL,
                name          TEXT NOT NULL,
                source_type   TEXT NOT NULL DEFAULT 'kaptargsm',
                source_url    TEXT,
                phone_number  TEXT,
                sms_template  TEXT,
                call_trigger  INTEGER NOT NULL DEFAULT 0,
                latitude      REAL,
                longitude     REAL,
                location_name TEXT,
                created_at    INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_scales_user ON scales(user_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_scales_phone ON scales(phone_number)")

        c.execute("""
            CREATE TABLE IF NOT EXISTS measurements (
                timestamp INTEGER NOT NULL,
                date_str  TEXT NOT NULL,
                weight    REAL NOT NULL,
                battery   REAL NOT NULL,
                temp      REAL NOT NULL,
                scale_id  TEXT NOT NULL,
                PRIMARY KEY (scale_id, timestamp)
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_measurements_scale_ts ON measurements(scale_id, timestamp)")

        c.execute("""
            CREATE TABLE IF NOT EXISTS seasons (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                scale_id      TEXT NOT NULL,
                flower_id     TEXT NOT NULL,
                start_ts      INTEGER NOT NULL,
                end_ts        INTEGER,
                start_weight  REAL NOT NULL,
                end_weight    REAL,
                latitude      REAL,
                longitude     REAL,
                location_name TEXT
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_seasons_scale ON seasons(scale_id, start_ts)")

        c.execute("""
            CREATE TABLE IF NOT EXISTS tare_events (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                scale_id   TEXT NOT NULL,
                timestamp  INTEGER NOT NULL,
                offset     REAL NOT NULL,
                target_net REAL,
                note       TEXT,
                created_at INTEGER NOT NULL
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_tare_events_scale_ts ON tare_events(scale_id, timestamp)")

        c.execute("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                endpoint    TEXT NOT NULL UNIQUE,
                keys_json   TEXT NOT NULL,
                created_at  INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)")

        c.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER NOT NULL,
                key     TEXT NOT NULL,
                value   TEXT NOT NULL,
                PRIMARY KEY (user_id, key),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Seed defaults
        for k, v in DEFAULT_SETTINGS.items():
            c.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", (k, v))

        # Add last_synced_at to users if missing (idempotent).
        if not _column_exists(c, "users", "last_synced_at"):
            c.execute("ALTER TABLE users ADD COLUMN last_synced_at INTEGER")

        # Add call_trigger to scales if missing (idempotent).
        if not _column_exists(c, "scales", "call_trigger"):
            c.execute("ALTER TABLE scales ADD COLUMN call_trigger INTEGER NOT NULL DEFAULT 0")

        # Seed Roland's per-user settings from global table (idempotent per key).
        for k in DEFAULT_USER_SETTINGS:
            row = c.execute("SELECT value FROM settings WHERE key=?", (k,)).fetchone()
            v = row["value"] if row else DEFAULT_USER_SETTINGS[k]
            c.execute(
                "INSERT OR IGNORE INTO user_settings(user_id,key,value) VALUES(?,?,?)",
                (owner_id, k, v),
            )
        for fid, name in DEFAULT_FLOWERS:
            c.execute("INSERT OR IGNORE INTO flowers(id,name) VALUES(?,?)", (fid, name))

        # Fresh install: seed Roland's original scale so he sees something right away.
        any_scale = c.execute("SELECT 1 FROM scales LIMIT 1").fetchone()
        if not any_scale:
            c.execute(
                "INSERT INTO scales(id, user_id, name, source_type, source_url, created_at) "
                "VALUES(?,?,?,?,?,?)",
                ("J0102466", owner_id, "Tesó kaptára", "kaptargsm",
                 "https://www.kaptargsm.hu/scale/J0102466.php", now),
            )

        # Defensive: clean sensor glitches
        c.execute("DELETE FROM measurements WHERE weight < 5.0")


def _migrate_hives_to_scales(c, owner_id: int) -> None:
    """Migrate the legacy single-user schema to multi-user.

    - hives → scales (add user_id, source_type, phone_number, sms_template, location cols)
    - measurements: rename hive_id → scale_id, switch PK to (scale_id, timestamp)
    - seasons: rename hive_id → scale_id, add location columns
    - tare_events: rename hive_id → scale_id
    - push_subscriptions: add user_id (attach all to legacy owner)
    """
    # 1. Build scales from hives.
    c.execute("""
        CREATE TABLE scales (
            id            TEXT PRIMARY KEY,
            user_id       INTEGER NOT NULL,
            name          TEXT NOT NULL,
            source_type   TEXT NOT NULL DEFAULT 'kaptargsm',
            source_url    TEXT,
            phone_number  TEXT,
            sms_template  TEXT,
            latitude      REAL,
            longitude     REAL,
            location_name TEXT,
            created_at    INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    c.execute(
        "INSERT INTO scales(id, user_id, name, source_type, source_url, created_at) "
        "SELECT id, ?, name, 'kaptargsm', source_url, created_at FROM hives",
        (owner_id,),
    )
    c.execute("DROP TABLE hives")

    # 2. Rebuild measurements with composite PK and renamed column.
    c.execute("ALTER TABLE measurements RENAME TO _measurements_old")
    c.execute("""
        CREATE TABLE measurements (
            timestamp INTEGER NOT NULL,
            date_str  TEXT NOT NULL,
            weight    REAL NOT NULL,
            battery   REAL NOT NULL,
            temp      REAL NOT NULL,
            scale_id  TEXT NOT NULL,
            PRIMARY KEY (scale_id, timestamp)
        )
    """)
    c.execute(
        "INSERT INTO measurements(timestamp, date_str, weight, battery, temp, scale_id) "
        "SELECT timestamp, date_str, weight, battery, temp, hive_id FROM _measurements_old"
    )
    c.execute("DROP TABLE _measurements_old")

    # 3. Seasons: rename column + add location fields.
    if _column_exists(c, "seasons", "hive_id"):
        c.execute("ALTER TABLE seasons RENAME COLUMN hive_id TO scale_id")
    if not _column_exists(c, "seasons", "latitude"):
        c.execute("ALTER TABLE seasons ADD COLUMN latitude REAL")
        c.execute("ALTER TABLE seasons ADD COLUMN longitude REAL")
        c.execute("ALTER TABLE seasons ADD COLUMN location_name TEXT")

    # 4. Tare events: rename column.
    if _column_exists(c, "tare_events", "hive_id"):
        c.execute("ALTER TABLE tare_events RENAME COLUMN hive_id TO scale_id")

    # 5. Push subscriptions: add user_id.
    if _table_exists(c, "push_subscriptions") and not _column_exists(c, "push_subscriptions", "user_id"):
        c.execute("ALTER TABLE push_subscriptions ADD COLUMN user_id INTEGER")
        c.execute("UPDATE push_subscriptions SET user_id=?", (owner_id,))


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


def get_user_setting(user_id: int, key: str, default: str | None = None) -> str | None:
    with db() as c:
        row = c.execute(
            "SELECT value FROM user_settings WHERE user_id=? AND key=?", (user_id, key)
        ).fetchone()
        if row:
            return row["value"]
    return DEFAULT_USER_SETTINGS.get(key, default)


def set_user_setting(user_id: int, key: str, value: str):
    with db() as c:
        c.execute(
            "INSERT INTO user_settings(user_id,key,value) VALUES(?,?,?) "
            "ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value",
            (user_id, key, value),
        )
