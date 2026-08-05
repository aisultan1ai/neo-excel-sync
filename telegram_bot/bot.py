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
    WAIT_DATE,
    WAIT_PERIOD,
    cmd_cancel,
    cmd_start,
    on_button,
    on_date_input,
    on_period_input,
)


def build_app() -> Application:
    """Собрать Application с зарегистрированными хендлерами."""
    app = Application.builder().token(BOT_TOKEN).build()

    # Диалог: кнопка → ожидание ввода → результат
    conv = ConversationHandler(
        entry_points=[CallbackQueryHandler(on_button)],
        states={
            WAIT_DATE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, on_date_input),
            ],
            WAIT_PERIOD: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, on_period_input),
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
    app = build_app()
    logging.info("Бот запущен (long polling)")
    app.run_polling()


if __name__ == "__main__":
    main()
