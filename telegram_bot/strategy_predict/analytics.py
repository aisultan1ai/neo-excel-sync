import io
import logging
from datetime import date, timedelta

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .predictor import RULE_VERSION
from .storage import get_conn

log = logging.getLogger(__name__)


def _daterange(days: int) -> tuple[str, str]:
    to = date.today()
    frm = to - timedelta(days=days - 1)
    return frm.isoformat(), to.isoformat()


def period_report(days: int) -> dict:
    frm, to = _daterange(days)
    with get_conn() as conn:
        by_day = conn.execute(
            """SELECT trade_date,
                      SUM(COALESCE(closed_pnl, 0)) AS pnl,
                      SUM(CASE WHEN side='BUY'  THEN 1 ELSE 0 END) AS n_buy,
                      SUM(CASE WHEN side='SELL' THEN 1 ELSE 0 END) AS n_sell
               FROM trades
               WHERE trade_date BETWEEN ? AND ?
               GROUP BY trade_date
               ORDER BY trade_date""",
            (frm, to),
        ).fetchall()

        by_ticker = conn.execute(
            """SELECT ticker,
                      COUNT(*) AS n,
                      SUM(COALESCE(closed_pnl, 0)) AS pnl
               FROM trades
               WHERE trade_date BETWEEN ? AND ?
               GROUP BY ticker
               ORDER BY n DESC
               LIMIT 10""",
            (frm, to),
        ).fetchall()

        rec = conn.execute(
            """SELECT AVG(precision_) AS p, AVG(recall) AS r, AVG(f1) AS f,
                      COUNT(*) AS n
               FROM reconciliations
               WHERE rule_version = ? AND date BETWEEN ? AND ?""",
            (RULE_VERSION, frm, to),
        ).fetchone()

    days_rows = [dict(r) for r in by_day]
    total_pnl = sum(d["pnl"] or 0.0 for d in days_rows)
    total_trades = sum((d["n_buy"] or 0) + (d["n_sell"] or 0) for d in days_rows)

    return {
        "from_date": frm,
        "to_date": to,
        "days": days_rows,
        "by_ticker": [dict(r) for r in by_ticker],
        "total_pnl": total_pnl,
        "total_trades": total_trades,
        "reconcile": {
            "n": rec["n"] or 0,
            "precision": rec["p"] or 0.0,
            "recall": rec["r"] or 0.0,
            "f1": rec["f"] or 0.0,
        },
    }


def plot_period(report: dict) -> bytes:
    fig, ax = plt.subplots(figsize=(9, 4.5))
    days = report["days"]
    if not days:
        ax.text(0.5, 0.5, "нет сделок за период", ha="center", va="center"); ax.axis("off")
    else:
        dates = [d["trade_date"] for d in days]
        pnl = [d["pnl"] or 0.0 for d in days]
        colors = ["#2f9e44" if x >= 0 else "#d43a3a" for x in pnl]
        ax.bar(dates, pnl, color=colors)
        ax.axhline(0, color="black", linewidth=0.8)
        ax.set_ylabel("PnL (реализ.)")
        rec = report["reconcile"]
        title = (
            f"{report['from_date']} → {report['to_date']}  "
            f"|  Σ PnL: {report['total_pnl']:+.2f}  |  сделок: {report['total_trades']}"
        )
        if rec["n"]:
            title += f"  |  F1(avg, n={rec['n']}): {rec['f1']:.2f}"
        ax.set_title(title)
        ax.tick_params(axis="x", labelrotation=45)
        ax.grid(axis="y", linestyle=":", alpha=0.5)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    return buf.getvalue()
