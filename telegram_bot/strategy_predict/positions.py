import logging
from collections import defaultdict, deque
from dataclasses import dataclass

from .storage import get_conn

log = logging.getLogger(__name__)


@dataclass
class _Lot:
    execution_id: str
    open_date: str
    price: float
    amount_signed: float
    amount_remaining: float


@dataclass
class _ClosedPosition:
    account_id: str
    ticker: str
    open_execution_id: str
    open_date: str
    open_price: float
    amount_open: float
    close_date: str
    realized_pnl: float


def rebuild_positions_fifo() -> dict:
    with get_conn() as conn:
        conn.execute("DELETE FROM positions")

        trades = conn.execute(
            """
            SELECT execution_id, account_id, ticker, side, amount, price,
                   transact_time, trade_date, closed_pnl
            FROM trades
            ORDER BY account_id, ticker, transact_time, execution_id
            """
        ).fetchall()

        open_lots: dict[tuple[str, str], deque[_Lot]] = defaultdict(deque)
        closed: list[_ClosedPosition] = []
        realized_total = 0.0
        closed_pnl_from_trades_total = 0.0

        for t in trades:
            key = (t["account_id"], t["ticker"])
            qty = float(t["amount"])
            price = float(t["price"])
            if t["closed_pnl"] is not None:
                closed_pnl_from_trades_total += float(t["closed_pnl"])

            remaining = qty
            queue = open_lots[key]
            while remaining != 0 and queue and _opposite_sign(queue[0].amount_remaining, remaining):
                lot = queue[0]
                close_qty = min(abs(lot.amount_remaining), abs(remaining))
                pnl = (price - lot.price) * close_qty * (1.0 if lot.amount_signed > 0 else -1.0)
                realized_total += pnl

                closed.append(_ClosedPosition(
                    account_id=t["account_id"],
                    ticker=t["ticker"],
                    open_execution_id=lot.execution_id,
                    open_date=lot.open_date,
                    open_price=lot.price,
                    amount_open=close_qty * (1.0 if lot.amount_signed > 0 else -1.0),
                    close_date=t["trade_date"],
                    realized_pnl=pnl,
                ))

                lot.amount_remaining -= close_qty * (1.0 if lot.amount_signed > 0 else -1.0)
                remaining -= close_qty * (1.0 if remaining > 0 else -1.0)
                if abs(lot.amount_remaining) < 1e-9:
                    queue.popleft()

            if abs(remaining) > 1e-9:
                queue.append(_Lot(
                    execution_id=t["execution_id"],
                    open_date=t["trade_date"],
                    price=price,
                    amount_signed=remaining,
                    amount_remaining=remaining,
                ))

        for p in closed:
            conn.execute(
                """
                INSERT INTO positions (
                    account_id, ticker, open_execution_id, open_date, open_price,
                    amount_open, amount_remaining, close_date, realized_pnl
                ) VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (p.account_id, p.ticker, p.open_execution_id, p.open_date, p.open_price,
                 p.amount_open, 0.0, p.close_date, p.realized_pnl),
            )

        n_open = 0
        for (account_id, ticker), queue in open_lots.items():
            for lot in queue:
                if abs(lot.amount_remaining) < 1e-9:
                    continue
                conn.execute(
                    """
                    INSERT INTO positions (
                        account_id, ticker, open_execution_id, open_date, open_price,
                        amount_open, amount_remaining, close_date, realized_pnl
                    ) VALUES (?,?,?,?,?,?,?,?,?)
                    """,
                    (account_id, ticker, lot.execution_id, lot.open_date, lot.price,
                     lot.amount_signed, lot.amount_remaining, None, 0.0),
                )
                n_open += 1

    return {
        "trades_processed": len(trades),
        "closed_positions": len(closed),
        "open_positions": n_open,
        "realized_pnl_fifo": round(realized_total, 4),
        "closed_pnl_from_trades": round(closed_pnl_from_trades_total, 4),
        "pnl_diff": round(realized_total - closed_pnl_from_trades_total, 4),
    }


def _opposite_sign(a: float, b: float) -> bool:
    return (a > 0 and b < 0) or (a < 0 and b > 0)
