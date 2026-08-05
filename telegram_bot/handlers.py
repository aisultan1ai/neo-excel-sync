"""Telegram-хендлеры: /start, /setaccount, /myid, inline-кнопки, ввод даты/периода."""
import functools
import logging
import re
from datetime import date, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes, ConversationHandler

from api import ApiError, fetch_instrument_details, fetch_trades
from config import ACCOUNT_ID_DEFAULT, ALLOWED_USER_IDS
from formatter import format_trades
from storage import (
    add_instruments,
    get_cached_instruments,
    get_user_account,
    missing_instrument_ids,
    set_user_account,
)

log = logging.getLogger(__name__)

# Состояния диалога
WAIT_DATE = 1
WAIT_PERIOD = 2
WAIT_ACCOUNT = 3

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ACCOUNT_RE = re.compile(r"^\d+$")


def require_auth(handler):
    """
    Декоратор: пропускает только пользователей из ALLOWED_USER_IDS.
    Остальным — сообщение об отказе и логирование попытки.
    """
    @functools.wraps(handler)
    async def wrapper(update: Update, ctx: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user = update.effective_user
        user_id = user.id if user else None

        if user_id not in ALLOWED_USER_IDS:
            log.warning(
                "Отказ в доступе: user_id=%s username=%s",
                user_id,
                user.username if user else None,
            )
            if update.callback_query:
                await update.callback_query.answer(
                    "Доступ запрещён", show_alert=True,
                )
            elif update.message:
                await update.message.reply_text(
                    "⛔ Доступ запрещён.\n"
                    "Твой ID можно узнать командой /myid — "
                    "перешли его администратору для добавления в whitelist."
                )
            return ConversationHandler.END
        return await handler(update, ctx, *args, **kwargs)

    return wrapper


async def cmd_myid(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Открытая команда — сообщает пользователю его Telegram ID."""
    u = update.effective_user
    if not u:
        return
    is_allowed = u.id in ALLOWED_USER_IDS
    status = "✅ есть доступ" if is_allowed else "⛔ доступа нет"
    await update.message.reply_text(
        f"Твой Telegram ID: <code>{u.id}</code>\n"
        f"Username: @{u.username or '—'}\n"
        f"Статус: {status}",
        parse_mode=ParseMode.HTML,
    )


def _effective_account(user_id: int) -> str | None:
    """Приоритет: пользовательский → дефолтный из env."""
    return get_user_account(user_id) or ACCOUNT_ID_DEFAULT


def _main_kb(current_account: str | None) -> InlineKeyboardMarkup:
    acct_label = (
        f"Счёт: {current_account} (сменить)"
        if current_account
        else "Задать счёт"
    )
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("За сегодня", callback_data="today"),
            InlineKeyboardButton("За вчера", callback_data="yesterday"),
        ],
        [
            InlineKeyboardButton("Ввести дату", callback_data="ask_date"),
            InlineKeyboardButton("Ввести период", callback_data="ask_period"),
        ],
        [
            InlineKeyboardButton(acct_label, callback_data="set_account"),
        ],
    ])


def _greeting(user_id: int) -> str:
    acct = _effective_account(user_id)
    if acct:
        return (
            f"Привет! Текущий счёт: <b>{acct}</b>\n"
            f"Выберите период:"
        )
    return (
        "Привет! Счёт пока не задан — можно продолжить без фильтра по счёту "
        "или задать его кнопкой ниже.\nВыберите период:"
    )


@require_auth
async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    user_id = update.effective_user.id
    await update.message.reply_text(
        _greeting(user_id),
        reply_markup=_main_kb(_effective_account(user_id)),
        parse_mode=ParseMode.HTML,
    )
    return ConversationHandler.END


@require_auth
async def cmd_setaccount(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    """Команда /setaccount — начать ввод ID счёта."""
    await update.message.reply_text(
        "Введите ID счёта (только цифры). /cancel — отмена."
    )
    return WAIT_ACCOUNT


@require_auth
async def on_button(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    """Реакция на клик по inline-кнопке."""
    q = update.callback_query
    await q.answer()
    user_id = update.effective_user.id

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
            "Введите дату в формате <b>ГГГГ-ММ-ДД</b> (пример: <code>2026-08-05</code>).\n"
            "/cancel — отмена.",
            parse_mode=ParseMode.HTML,
        )
        return WAIT_DATE

    if q.data == "ask_period":
        await q.message.reply_text(
            "Введите период двумя датами через пробел:\n"
            "<b>ГГГГ-ММ-ДД ГГГГ-ММ-ДД</b> (пример: <code>2026-08-01 2026-08-05</code>).\n"
            "/cancel — отмена.",
            parse_mode=ParseMode.HTML,
        )
        return WAIT_PERIOD

    if q.data == "set_account":
        await q.message.reply_text(
            "Введите ID счёта (только цифры). /cancel — отмена."
        )
        return WAIT_ACCOUNT

    _ = user_id  # placeholder — не удаляем на будущее
    return ConversationHandler.END


@require_auth
async def on_date_input(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
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


@require_auth
async def on_period_input(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
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


@require_auth
async def on_account_input(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip()
    if not ACCOUNT_RE.match(text):
        await update.message.reply_text(
            "❌ ID счёта должен состоять только из цифр. Повторите или /cancel."
        )
        return WAIT_ACCOUNT

    user_id = update.effective_user.id
    set_user_account(user_id, text)
    await update.message.reply_text(
        f"✅ Счёт сохранён: <b>{text}</b>",
        reply_markup=_main_kb(text),
        parse_mode=ParseMode.HTML,
    )
    return ConversationHandler.END


@require_auth
async def cmd_cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    user_id = update.effective_user.id
    await update.message.reply_text(
        "Отменено.",
        reply_markup=_main_kb(_effective_account(user_id)),
    )
    return ConversationHandler.END


async def _send_trades(
    update: Update,
    ctx: ContextTypes.DEFAULT_TYPE,
    from_date: str,
    to_date: str,
) -> None:
    """
    Основной поток:
      1) запрос сделок с учётом accountId пользователя
      2) если среди сделок есть instrumentId, которых нет в кэше — добираем справочник
      3) форматируем и отдаём
      4) снова показываем меню
    """
    chat_id = update.effective_chat.id
    user_id = update.effective_user.id
    account_id = _effective_account(user_id)

    status = await ctx.bot.send_message(chat_id, "⏳ Загружаю сделки...")

    try:
        trades = await fetch_trades(from_date, to_date, account_id=account_id)
    except ApiError as e:
        await status.edit_text(f"⚠️ {e}")
        await ctx.bot.send_message(
            chat_id, "Выберите период:",
            reply_markup=_main_kb(account_id),
        )
        return
    except Exception as e:  # noqa: BLE001
        log.exception("Неожиданная ошибка при запросе /trades")
        await status.edit_text(f"⚠️ Внутренняя ошибка: {type(e).__name__}")
        await ctx.bot.send_message(
            chat_id, "Выберите период:",
            reply_markup=_main_kb(account_id),
        )
        return

    # Ленивое обогащение справочника: только по недостающим instrumentId
    needed_ids = [
        int(t["instrumentId"]) for t in trades
        if t.get("instrumentId") is not None
    ]
    to_fetch = missing_instrument_ids(needed_ids)
    if to_fetch:
        try:
            new_items = await fetch_instrument_details(to_fetch)
            if new_items:
                add_instruments(new_items)
        except Exception:  # noqa: BLE001
            # Справочник — не критичный, просто залогируем
            log.exception("Не удалось обогатить справочник инструментов")

    instruments = get_cached_instruments()
    messages = format_trades(trades, from_date, to_date, instruments)

    # Первое сообщение заменяет «Загружаю...»
    await status.edit_text(messages[0], parse_mode=ParseMode.HTML)
    for m in messages[1:]:
        await ctx.bot.send_message(chat_id, m, parse_mode=ParseMode.HTML)

    # Снова показываем меню
    await ctx.bot.send_message(
        chat_id,
        "Выберите ещё период:",
        reply_markup=_main_kb(account_id),
    )
