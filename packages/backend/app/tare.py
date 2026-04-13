"""Tára (zero-point) history helpers.

Modell: minden `tare_events` sor egy időponttól érvényes **abszolút** offsetet jelent,
amit a nyers mérésből ki kell vonni a nettó súlyhoz. Egy adott T időpontban az
effektív offset = a legutolsó olyan esemény `offset`-je, aminek `timestamp <= T`.
Ha nincs ilyen esemény, az offset 0.
"""
from __future__ import annotations
from typing import Iterable, List, Dict


def list_events(c, hive_id: str) -> List[Dict]:
    rows = c.execute(
        "SELECT id,hive_id,timestamp,offset,target_net,note,created_at "
        "FROM tare_events WHERE hive_id=? ORDER BY timestamp ASC",
        (hive_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def effective_offset(c, hive_id: str, ts_ms: int) -> float:
    row = c.execute(
        "SELECT offset FROM tare_events WHERE hive_id=? AND timestamp<=? "
        "ORDER BY timestamp DESC LIMIT 1",
        (hive_id, ts_ms),
    ).fetchone()
    return float(row["offset"]) if row else 0.0


def apply_offsets(events: List[Dict], rows: Iterable[Dict], ts_key: str = "timestamp", weight_key: str = "weight") -> None:
    """In-place: set row[weight_key] to net weight using the tare events list.

    `events` must be ordered ascending by timestamp. `rows` may be any order; we handle it
    by sorting events once and binary-walking per row would be overkill — linear search
    back from the latest event is fine given tiny event counts.
    """
    if not events:
        return
    ts_sorted = [e["timestamp"] for e in events]
    offs = [float(e["offset"]) for e in events]
    for r in rows:
        t = r[ts_key]
        # find largest i where ts_sorted[i] <= t
        lo, hi = 0, len(ts_sorted) - 1
        idx = -1
        while lo <= hi:
            mid = (lo + hi) // 2
            if ts_sorted[mid] <= t:
                idx = mid
                lo = mid + 1
            else:
                hi = mid - 1
        if idx >= 0:
            r[weight_key] = round(r[weight_key] - offs[idx], 2)
        # else: offset 0, unchanged
