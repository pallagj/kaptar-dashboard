import asyncio
import logging
import time

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .db import db, get_user_setting
from .scraper import sync_for_user

log = logging.getLogger("kaptar.scheduler")

_scheduler: AsyncIOScheduler | None = None
POLL_MINUTES = 15  # matches the smallest available sync_interval_minutes option


async def _job():
    now_ms = int(time.time() * 1000)
    with db() as c:
        users = c.execute("SELECT id, last_synced_at FROM users").fetchall()
    for u in users:
        user_id = u["id"]
        last_sync = u["last_synced_at"] or 0
        interval_min = int(get_user_setting(user_id, "sync_interval_minutes", "30") or "30")
        if now_ms - last_sync >= interval_min * 60 * 1000:
            try:
                res = await sync_for_user(user_id)
                log.info("synced user %d: %s", user_id, res)
            except Exception:
                log.exception("sync failed for user %d", user_id)
            with db() as c:
                c.execute("UPDATE users SET last_synced_at=? WHERE id=?", (now_ms, user_id))


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = AsyncIOScheduler(timezone="Europe/Budapest")
    _scheduler.add_job(_job, IntervalTrigger(minutes=POLL_MINUTES), id="sync", replace_existing=True, next_run_time=None)
    _scheduler.start()
    asyncio.get_event_loop().call_later(5, lambda: asyncio.create_task(_job()))
    log.info("scheduler started, poll interval=%d min", POLL_MINUTES)
    return _scheduler
