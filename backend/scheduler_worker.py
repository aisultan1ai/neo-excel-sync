import logging
from pathlib import Path

from apscheduler.schedulers.blocking import BlockingScheduler

from db.migrations import init_all
from utils.scheduler import run_scheduled_cashouts

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s", force=True
)
log = logging.getLogger(__name__)

_HEARTBEAT = Path("/tmp/scheduler_alive")


def _heartbeat():
    _HEARTBEAT.touch()


init_all()

scheduler = BlockingScheduler(timezone="UTC")
scheduler.add_job(run_scheduled_cashouts, "cron", hour=9, minute=0, id="cashout_daily")
scheduler.add_job(_heartbeat, "interval", minutes=1, id="heartbeat")

_HEARTBEAT.touch()
log.info("Cashout scheduler worker started (runs daily at 09:00 UTC).")
scheduler.start()
