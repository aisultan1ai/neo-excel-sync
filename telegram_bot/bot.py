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

    # /myid — открытая команда (без auth), нужна чтобы узнать свой ID
    app.add_handler(CommandHandler("myid", cmd_myid))
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(conv)
    return app


class _SecretMaskFilter(logging.Filter):
    """Затирает известные секреты в тексте лог-записей."""

    def __init__(self, secrets: list[str]):
        super().__init__()
        # Игнорируем пустые/короткие значения
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
            # Затираем и msg и args, чтобы форматирование не вернуло секрет
            record.msg = replaced
            record.args = ()
        return True


def main() -> None:
    logging.basicConfig(
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        level=logging.INFO,
    )
    # Приглушаем шум от long polling — httpx на каждый getUpdates пишет INFO.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("telegram.ext.Updater").setLevel(logging.WARNING)

    # Маскируем токены во ВСЕХ логах на случай если что-то их протащит.
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
