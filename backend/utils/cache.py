import os
import logging
from datetime import datetime, timedelta
from threading import Lock
from typing import Dict, Any

from core.config import CACHE_TTL_MINUTES, CACHE_MAX_ITEMS

log = logging.getLogger(__name__)

COMPARISON_CACHE: Dict[str, Any] = {}
LAST_RESULT_BY_USER: Dict[str, str] = {}
CACHE_LOCK = Lock()

UNITY_EXCHANGE_CACHE: Dict[str, Any] = {}
LAST_UNITY_EXCHANGE_BY_USER: Dict[str, str] = {}


def cleanup_cache():
    now = datetime.now()
    ttl = timedelta(minutes=CACHE_TTL_MINUTES)

    with CACHE_LOCK:
        expired_keys = [k for k, v in COMPARISON_CACHE.items() if (now - v.get("created_at", now)) > ttl]
        for k in expired_keys:
            COMPARISON_CACHE.pop(k, None)

        while len(COMPARISON_CACHE) > CACHE_MAX_ITEMS:
            oldest = min(COMPARISON_CACHE.keys(), key=lambda k: COMPARISON_CACHE[k]["created_at"])
            COMPARISON_CACHE.pop(oldest, None)

        valid_ids = set(COMPARISON_CACHE.keys())
        for user, cid in list(LAST_RESULT_BY_USER.items()):
            if cid not in valid_ids:
                LAST_RESULT_BY_USER.pop(user, None)


def cleanup_unity_exchange_cache():
    now = datetime.now()
    ttl = timedelta(minutes=CACHE_TTL_MINUTES)

    with CACHE_LOCK:
        expired = [k for k, v in UNITY_EXCHANGE_CACHE.items() if (now - v.get("created_at", now)) > ttl]
        for k in expired:
            try:
                rp = UNITY_EXCHANGE_CACHE[k].get("report_path")
                if rp and os.path.exists(rp):
                    os.remove(rp)
            except Exception:
                pass
            UNITY_EXCHANGE_CACHE.pop(k, None)

        while len(UNITY_EXCHANGE_CACHE) > CACHE_MAX_ITEMS:
            oldest = min(UNITY_EXCHANGE_CACHE.keys(), key=lambda k: UNITY_EXCHANGE_CACHE[k]["created_at"])
            try:
                rp = UNITY_EXCHANGE_CACHE[oldest].get("report_path")
                if rp and os.path.exists(rp):
                    os.remove(rp)
            except Exception:
                pass
            UNITY_EXCHANGE_CACHE.pop(oldest, None)

        valid = set(UNITY_EXCHANGE_CACHE.keys())
        for user, rid in list(LAST_UNITY_EXCHANGE_BY_USER.items()):
            if rid not in valid:
                LAST_UNITY_EXCHANGE_BY_USER.pop(user, None)
