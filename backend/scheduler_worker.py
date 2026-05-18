import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from db.migrations import init_all
from utils.scheduler import run_scheduled_cashouts

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s", force=True
)
log = logging.getLogger(__name__)

init_all()

scheduler = BlockingScheduler(timezone="UTC")
scheduler.add_job(run_scheduled_cashouts, "cron", hour=9, minute=0, id="cashout_daily")
log.info("Cashout scheduler worker started (runs daily at 09:00 UTC).")
scheduler.start()
