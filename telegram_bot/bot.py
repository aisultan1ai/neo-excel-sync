import logging

from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    filters,
)

from config import ALLOWED_USER_IDS, AUTH_TOKEN, BOT_TOKEN
from handlers import (
    WAIT_ACCOUNT,
    WAIT_DATE,
    WAIT_PERIOD,
    cmd_cancel,
    cmd_myid,
    cmd_setaccount,
    cmd_start,
    on_account_input,
    on_button,
    on_date_input,
    on_period_input,
)
from handlers_predict import (
    cmd_compare,
    cmd_drift,
    cmd_features,
    cmd_ml_status,
    cmd_pattern,
    cmd_predict,
    cmd_predict_ml,
    cmd_rebuild,
    cmd_reconcile,
    cmd_report,
    cmd_scheduler,
    cmd_scorecard,
    cmd_sync,
    cmd_train_ml,
    cmd_why,
    cmd_why_ml,
    on_predict_button,
)


def build_app() -> Application:
    try:
        from strategy_predict.storage import init_db
        init_db()
    except Exception:  # noqa: BLE001
        logging.exception("strategy_predict: init_db не удался (модуль будет неактивен)")

    app = Application.builder().token(BOT_TOKEN).build()

    conv = ConversationHandler(
        entry_points=[
            CallbackQueryHandler(on_button),
            CommandHandler("setaccount", cmd_setaccount),
        ],
        states={
            WAIT_DATE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, on_date_input),
            ],
            WAIT_PERIOD: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, on_period_input),
            ],
            WAIT_ACCOUNT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, on_account_input),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", cmd_cancel),
            CommandHandler("start", cmd_start),
        ],
        per_message=False,
    )

    app.add_handler(CommandHandler("myid", cmd_myid))
    app.add_handler(CommandHandler("start", cmd_start))

    app.add_handler(CommandHandler("sync", cmd_sync))
    app.add_handler(CommandHandler("rebuild", cmd_rebuild))
    app.add_handler(CommandHandler("features", cmd_features))
    app.add_handler(CommandHandler("predict", cmd_predict))
    app.add_handler(CommandHandler("why", cmd_why))
    app.add_handler(CommandHandler("reconcile", cmd_reconcile))
    app.add_handler(CommandHandler("scorecard", cmd_scorecard))
    app.add_handler(CommandHandler("compare", cmd_compare))
    app.add_handler(CommandHandler("drift", cmd_drift))
    app.add_handler(CommandHandler("pattern", cmd_pattern))
    app.add_handler(CommandHandler("report", cmd_report))

    app.add_handler(CommandHandler("ml_status", cmd_ml_status))
    app.add_handler(CommandHandler("train_ml", cmd_train_ml))
    app.add_handler(CommandHandler("predict_ml", cmd_predict_ml))
    app.add_handler(CommandHandler("why_ml", cmd_why_ml))
    app.add_handler(CommandHandler("scheduler", cmd_scheduler))

    app.add_handler(CallbackQueryHandler(
        on_predict_button,
        pattern=r"^(sync_|rebuild_|predict_|scorecard_|report_|pattern_|scheduler_|reconcile_|ml_)",
    ))

    app.add_handler(conv)

    try:
        from strategy_predict.scheduler import register_jobs
        register_jobs(app)
    except Exception:  # noqa: BLE001
        logging.exception("strategy_predict: scheduler не запустился")

    return app


class _SecretMaskFilter(logging.Filter):

    def __init__(self, secrets: list[str]):
        super().__init__()
        self.secrets = [s for s in secrets if s and len(s) >= 8]

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        replaced = msg
        for s in self.secrets:
            if s in replaced:
                replaced = replaced.replace(s, "***REDACTED***")
        if replaced != msg:
            record.msg = replaced
            record.args = ()
        return True


def main() -> None:
    logging.basicConfig(
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        level=logging.INFO,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("telegram.ext.Updater").setLevel(logging.WARNING)

    mask = _SecretMaskFilter([BOT_TOKEN, AUTH_TOKEN])
    for handler in logging.root.handlers:
        handler.addFilter(mask)

    app = build_app()
    if not ALLOWED_USER_IDS:
        logging.warning("Доступ запрещён")
    else:
        logging.info("Whitelist: разрешено %d user_id", len(ALLOWED_USER_IDS))
    logging.info("Бот запущен (long polling)")
    app.run_polling()


if __name__ == "__main__":
    main()
