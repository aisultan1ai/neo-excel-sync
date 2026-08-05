"""Точка входа: сборка приложения и запуск long polling."""
import logging

from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    filters,
)

from config import BOT_TOKEN
from handlers import (
    WAIT_ACCOUNT,
    WAIT_DATE,
    WAIT_PERIOD,
    cmd_cancel,
    cmd_setaccount,
    cmd_start,
    on_account_input,
    on_button,
    on_date_input,
    on_period_input,
)


def build_app() -> Application:
    """Собрать Application с зарегистрированными хендлерами."""
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

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(conv)
    return app


def main() -> None:
    logging.basicConfig(
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        level=logging.INFO,
    )
    # Приглушаем шум от long polling — httpx на каждый getUpdates пишет INFO.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("telegram.ext.Updater").setLevel(logging.WARNING)

    app = build_app()
    logging.info("Бот запущен (long polling)")
    app.run_polling()


if __name__ == "__main__":
    main()
