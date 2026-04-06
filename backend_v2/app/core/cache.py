from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from threading import Lock
from typing import Any

from app.core.config import settings


class ComparisonCache:
    def __init__(self):
        self._items: dict[str, dict[str, Any]] = {}
        self._last_by_user: dict[str, str] = {}
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
            self._items.pop(key, None)

        while len(self._items) > settings.CACHE_MAX_ITEMS:
            oldest = min(
                self._items.keys(),
                key=lambda k: self._items[k]["created_at"],
            )
            self._items.pop(oldest, None)

        valid_ids = set(self._items.keys())
        for user, cid in list(self._last_by_user.items()):
            if cid not in valid_ids:
                self._last_by_user.pop(user, None)

    def cleanup(self):
        with self._lock:
            self._cleanup_locked()

    def store_results(self, owner: str, data: dict[str, Any]) -> str:
        with self._lock:
            self._cleanup_locked()
            comparison_id = str(uuid.uuid4())
            self._items[comparison_id] = {
                "data": data,
                "created_at": datetime.now(),
                "owner": owner,
            }
            self._last_by_user[owner] = comparison_id
            self._cleanup_locked()
            return comparison_id

    def get_results(self, comparison_id: str) -> dict[str, Any] | None:
        with self._lock:
            self._cleanup_locked()
            item = self._items.get(comparison_id)
            if not item:
                return None
            return {
                "comparison_id": comparison_id,
                "data": item["data"],
                "owner": item["owner"],
                "created_at": item["created_at"],
            }

    def get_last_result(self, owner: str) -> dict[str, Any] | None:
        with self._lock:
            self._cleanup_locked()
            cid = self._last_by_user.get(owner)
            if not cid:
                return None
            item = self._items.get(cid)
            if not item:
                return None
            return {
                "comparison_id": cid,
                "data": item["data"],
                "owner": item["owner"],
                "created_at": item["created_at"],
            }


compare_cache = ComparisonCache()