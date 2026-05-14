import os
import threading

from cryptography.fernet import Fernet

_fernet: Fernet | None = None
_fernet_lock = threading.Lock()


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet
    with _fernet_lock:
        if _fernet is not None:
            return _fernet
        key = os.getenv("FERNET_KEY", "")
        if not key:
            raise RuntimeError("FERNET_KEY not configured")
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_value(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_value(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()
