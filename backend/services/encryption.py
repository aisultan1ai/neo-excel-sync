import os
import threading
from typing import Optional

from cryptography.fernet import Fernet, MultiFernet

_fernet: Optional[MultiFernet] = None
_fernet_lock = threading.Lock()


def _get_fernet() -> MultiFernet:
    global _fernet
    if _fernet is not None:
        return _fernet
    with _fernet_lock:
        if _fernet is not None:
            return _fernet
        # FERNET_KEYS: comma-separated list, first key used for encryption, all tried for decryption.
        # Supports key rotation: prepend new key, keep old key(s) at the end.
        keys_raw = os.getenv("FERNET_KEYS", "") or os.getenv("FERNET_KEY", "")
        if not keys_raw:
            raise RuntimeError("FERNET_KEY or FERNET_KEYS not configured")
        keys = [k.strip() for k in keys_raw.split(",") if k.strip()]
        if not keys:
            raise RuntimeError("FERNET_KEY or FERNET_KEYS not configured")
        fernets = [Fernet(k.encode() if isinstance(k, str) else k) for k in keys]
        _fernet = MultiFernet(fernets)
    return _fernet


def encrypt_value(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_value(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()
