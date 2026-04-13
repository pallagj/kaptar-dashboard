import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .db import get_setting
from .scraper import sync_all

log = logging.getLogger("kaptar.scheduler")

_scheduler: AsyncIOScheduler | None = None


async def _job():
    try:
        res = await sync_all()
        log.info("scheduled sync: %s", res)
    except Exception:
        log.exception("scheduled sync failed")


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    minutes = int(get_setting("sync_interval_minutes", "30") or "30")
    _scheduler = AsyncIOScheduler(timezone="Europe/Budapest")
    _scheduler.add_job(_job, IntervalTrigger(minutes=minutes), id="sync", replace_existing=True, next_run_time=None)
    _scheduler.start()
    # Kick off an initial fetch shortly after startup
    asyncio.get_event_loop().call_later(5, lambda: asyncio.create_task(_job()))
    log.info("scheduler started, interval=%d min", minutes)
    return _scheduler


def reschedule(minutes: int):
    if _scheduler is None:
        return
    _scheduler.reschedule_job("sync", trigger=IntervalTrigger(minutes=minutes))
    log.info("scheduler rescheduled: %d min", minutes)
