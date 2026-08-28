from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.unity_exchange.reconcile_core import (
    ReconcileParams,
    reconcile_to_report_with_preview,
)


def get_unity_exchange_report_dir() -> Path:
    report_dir = Path(settings.STORAGE_ROOT) / "reports" / "unity_exchange"
    report_dir.mkdir(parents=True, exist_ok=True)
    return report_dir


def run_unity_exchange_job(
    unity_path: str,
    exchange_path: str,
    exchange_type: str,
    params_dict: dict[str, Any] | None = None,
    preview_limit: int = 2000,
) -> dict[str, Any]:
    params = ReconcileParams(**(params_dict or {}))

    result, preview = reconcile_to_report_with_preview(
        unity_xlsx_path=Path(unity_path),
        exchange_path=Path(exchange_path),
        report_dir=get_unity_exchange_report_dir(),
        exchange_type=exchange_type,
        params=params,
        preview_limit=preview_limit,
    )

    return {
        "report_path": str(result.report_path),
        "report_filename": os.path.basename(str(result.report_path)),
        "exchange_name": result.summary.exchange_name,
        "summary": result.summary.__dict__,
        "preview": preview,
    }