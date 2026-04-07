from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from threading import Lock
from typing import Any

from app.core.config import settings


class UnityExchangeCache:
    def __init__(self):
        self._items: dict[str, dict[str, Any]] = {}
        self._lock = Lock()

    def _cleanup_locked(self):
        now = datetime.now()
        ttl = timedelta(minutes=settings.CACHE_TTL_MINUTES)

        expired = [
            key
            for key, value in self._items.items()
            if (now - value.get("created_at", now)) > ttl
        ]

        for key in expired:
            item = self._items.get(key)
            if item:
                report_path = item.get("report_path")
                if report_path and os.path.exists(report_path):
                    try:
                        os.remove(report_path)
                    except Exception:
                        pass
            self._items.pop(key, None)

        while len(self._items) > settings.CACHE_MAX_ITEMS:
            oldest = min(
                self._items.keys(),
                key=lambda k: self._items[k]["created_at"],
            )
            item = self._items.get(oldest)
            if item:
                report_path = item.get("report_path")
                if report_path and os.path.exists(report_path):
                    try:
                        os.remove(report_path)
                    except Exception:
                        pass
            self._items.pop(oldest, None)

    def cleanup(self):
        with self._lock:
            self._cleanup_locked()

    def store_run(
        self,
        owner: str,
        report_path: str,
        payload: dict[str, Any],
    ) -> str:
        with self._lock:
            self._cleanup_locked()
            run_id = uuid.uuid4().hex
            self._items[run_id] = {
                "created_at": datetime.now(),
                "owner": owner,
                "report_path": report_path,
                "payload": payload,
            }
            self._cleanup_locked()
            return run_id

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            self._cleanup_locked()
            item = self._items.get(run_id)
            if not item:
                return None
            return {
                "run_id": run_id,
                "created_at": item["created_at"],
                "owner": item["owner"],
                "report_path": item["report_path"],
                "payload": item["payload"],
            }


unity_exchange_cache = UnityExchangeCache()