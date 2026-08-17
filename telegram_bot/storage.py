import json
import logging
from threading import Lock

from config import DATA_DIR, STATE_FILE

log = logging.getLogger(__name__)

_lock = Lock()
_state: dict | None = None


def _load() -> dict:
    global _state
    if _state is not None:
        return _state

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        try:
            _state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            if not isinstance(_state, dict):
                _state = {}
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Не удалось прочитать %s: %s", STATE_FILE, e)
            _state = {}
    else:
        _state = {}

    _state.setdefault("instruments", {})
    _state.setdefault("accounts", {})
    return _state


def _save() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(_state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


def get_cached_instruments() -> dict[int, str]:
    with _lock:
        s = _load()
        return {int(k): v for k, v in s["instruments"].items()}


def missing_instrument_ids(needed_ids: list[int]) -> list[int]:
    with _lock:
        s = _load()
        cached = set(int(k) for k in s["instruments"].keys())
        return [i for i in set(needed_ids) if i not in cached]


def add_instruments(mapping: dict[int, str]) -> None:
    if not mapping:
        return
    with _lock:
        s = _load()
        for k, v in mapping.items():
            s["instruments"][str(int(k))] = str(v)
        _save()


def get_user_account(user_id: int) -> str | None:
    with _lock:
        s = _load()
        return s["accounts"].get(str(user_id))


def set_user_account(user_id: int, account_id: str) -> None:
    with _lock:
        s = _load()
        s["accounts"][str(user_id)] = str(account_id)
        _save()


def clear_user_account(user_id: int) -> None:
    with _lock:
        s = _load()
        s["accounts"].pop(str(user_id), None)
        _save()
