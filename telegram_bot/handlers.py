"""Telegram-хендлеры: /start, inline-кнопки, ввод даты/периода."""
import logging
import re
from datetime import date, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes, ConversationHandler

from api import ApiError, fetch_trades
from formatter import format_trades

log = logging.getLogger(__name__)

# Состояния диалога
WAIT_DATE = 1
WAIT_PERIOD = 2

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _main_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("За сегодня", callback_data="today"),
            InlineKeyboardButton("За вчера", callback_data="yesterday"),
        ],
        [
            InlineKeyboardButton("Ввести дату", callback_data="ask_date"),
            InlineKeyboardButton("Ввести период", callback_data="ask_period"),
        ],
    ])


async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    """Обработчик /start — показывает меню и завершает возможный диалог."""
    await update.message.reply_text(
        "Привет! Выберите период для загрузки сделок:",
        reply_markup=_main_kb(),
    )
    return ConversationHandler.END


async def on_button(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    """Реакция на клик по inline-кнопке."""
    q = update.callback_query
    await q.answer()

    if q.data == "today":
        d = date.today().isoformat()
        await _send_trades(update, ctx, d, d)
        return ConversationHandler.END

    if q.data == "yesterday":
        d = (date.today() - timedelta(days=1)).isoformat()
        await _send_trades(update, ctx, d, d)
        return ConversationHandler.END

    if q.data == "ask_date":
        await q.message.reply_text(
            "Введите дату в формате ГГГГ-ММ-ДД (пример: 2026-08-05).\n"
            "/cancel — отмена."
        )
        return WAIT_DATE

    if q.data == "ask_period":
        await q.message.reply_text(
            "Введите период двумя датами через пробел:\n"
            "«ГГГГ-ММ-ДД ГГГГ-ММ-ДД» (пример: 2026-08-01 2026-08-05).\n"
            "/cancel — отмена."
        )
        return WAIT_PERIOD

    return ConversationHandler.END


async def on_date_input(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    """Пользователь ввёл одну дату."""
    text = (update.message.text or "").strip()

    if not DATE_RE.match(text):
        await update.message.reply_text(
            "❌ Неверный формат. Пример: 2026-08-05.\n"
            "Введите ещё раз или /cancel."
        )
        return WAIT_DATE

    try:
        date.fromisoformat(text)
    except ValueError:
        await update.message.reply_text("❌ Такой даты не существует. Повторите ввод.")
        return WAIT_DATE

    await _send_trades(update, ctx, text, text)
    return ConversationHandler.END


async def on_period_input(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    """Пользователь ввёл диапазон из двух дат."""
    text = (update.message.text or "").strip()
    parts = text.split()

    if len(parts) != 2 or not all(DATE_RE.match(p) for p in parts):
        await update.message.reply_text(
            "❌ Неверный формат. Пример: 2026-08-01 2026-08-05.\n"
            "Введите ещё раз или /cancel."
        )
        return WAIT_PERIOD

    try:
        d_from = date.fromisoformat(parts[0])
        d_to = date.fromisoformat(parts[1])
    except ValueError:
        await update.message.reply_text("❌ Одна из дат не существует. Повторите ввод.")
        return WAIT_PERIOD

    if d_from > d_to:
        await update.message.reply_text(
            "❌ Начальная дата больше конечной. Повторите ввод."
        )
        return WAIT_PERIOD

    await _send_trades(update, ctx, parts[0], parts[1])
    return ConversationHandler.END


async def cmd_cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    """Прервать диалог."""
    await update.message.reply_text("Отменено. /start — вернуться в меню.")
    return ConversationHandler.END


async def _send_trades(
    update: Update,
    ctx: ContextTypes.DEFAULT_TYPE,
    from_date: str,
    to_date: str,
) -> None:
    """Запрашивает сделки у API и отправляет пользователю отформатированный ответ."""
    chat_id = update.effective_chat.id
    status = await ctx.bot.send_message(chat_id, "⏳ Загружаю сделки...")

    try:
        trades = await fetch_trades(from_date, to_date)
    except ApiError as e:
        await status.edit_text(f"⚠️ {e}")
        return
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка при запросе к API")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        return

    messages = format_trades(trades, from_date, to_date)
    # Первое сообщение заменяет «Загружаю...»
    await status.edit_text(messages[0])
    for m in messages[1:]:
        await ctx.bot.send_message(chat_id, m)
