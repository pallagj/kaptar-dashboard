"""Tára (zero-point) history helpers.

Modell: minden `tare_events` sor egy időponttól érvényes **abszolút** offsetet jelent,
amit a nyers mérésből ki kell vonni a nettó súlyhoz. Egy adott T időpontban az
effektív offset = a legutolsó olyan esemény `offset`-je, aminek `timestamp <= T`.
Ha nincs ilyen esemény, az offset 0.
"""
from __future__ import annotations
from typing import Dict, Iterable, List


def list_events(c, scale_id: str) -> List[Dict]:
    rows = c.execute(
        "SELECT id,scale_id,timestamp,offset,target_net,note,created_at "
        "FROM tare_events WHERE scale_id=? ORDER BY timestamp ASC",
        (scale_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def effective_offset(c, scale_id: str, ts_ms: int) -> float:
    row = c.execute(
        "SELECT offset FROM tare_events WHERE scale_id=? AND timestamp<=? "
        "ORDER BY timestamp DESC LIMIT 1",
        (scale_id, ts_ms),
    ).fetchone()
    return float(row["offset"]) if row else 0.0


def apply_offsets(events: List[Dict], rows: Iterable[Dict],
                   ts_key: str = "timestamp", weight_key: str = "weight") -> None:
    """In-place: set row[weight_key] to net weight using the tare events list.

    `events` must be ordered ascending by timestamp.
    """
    if not events:
        return
    ts_sorted = [e["timestamp"] for e in events]
    offs = [float(e["offset"]) for e in events]
    for r in rows:
        t = r[ts_key]
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
