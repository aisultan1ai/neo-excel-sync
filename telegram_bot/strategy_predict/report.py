import io
import logging

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

log = logging.getLogger(__name__)


def plot_prediction_ranking(
    buy: list[dict],
    sell: list[dict],
    target_date: str,
) -> bytes:
    fig, ax = plt.subplots(figsize=(8, max(4, 0.4 * (len(buy) + len(sell)) + 2)))

    labels: list[str] = []
    values: list[float] = []
    colors: list[str] = []

    for s in sell[::-1]:
        labels.append(f"SELL {s['ticker']}")
        values.append(s["confidence"])
        colors.append("#d43a3a")
    for b in buy:
        labels.append(f"BUY  {b['ticker']}")
        values.append(b["confidence"])
        colors.append("#2f9e44")

    if not labels:
        ax.text(0.5, 0.5, "нет данных для прогноза", ha="center", va="center")
        ax.axis("off")
    else:
        ax.barh(labels, values, color=colors)
        ax.set_xlim(0.5, 1.0)
        ax.set_xlabel("confidence")
        ax.set_title(f"Прогноз на {target_date} — rule mrv-1.0")
        ax.grid(axis="x", linestyle=":", alpha=0.5)

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    return buf.getvalue()


def plot_scorecard(history: list[dict], per_ticker: dict[str, dict]) -> bytes:
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 8))

    if history:
        dates = [h["date"] for h in history]
        f1 = [h["f1"] for h in history]
        prec = [h["precision"] for h in history]
        rec = [h["recall"] for h in history]
        ax1.plot(dates, f1, marker="o", label="F1", color="#1f77b4", linewidth=2)
        ax1.plot(dates, prec, marker=".", label="precision", color="#2f9e44", alpha=0.7)
        ax1.plot(dates, rec, marker=".", label="recall", color="#d43a3a", alpha=0.7)
        ax1.set_ylim(0, 1)
        ax1.set_ylabel("score")
        ax1.set_title(f"Scorecard за последние {len(history)} сверок")
        ax1.legend(loc="lower right")
        ax1.grid(axis="y", linestyle=":", alpha=0.5)
        ax1.tick_params(axis="x", labelrotation=45)
    else:
        ax1.text(0.5, 0.5, "нет данных", ha="center", va="center"); ax1.axis("off")

    if per_ticker:
        tickers = sorted(per_ticker.keys(),
                         key=lambda t: -(per_ticker[t]["hits"] + per_ticker[t]["misses"]))[:15]
        hits = [per_ticker[t]["hits"] for t in tickers]
        misses = [per_ticker[t]["misses"] for t in tickers]
        extras = [per_ticker[t]["extras"] for t in tickers]
        x = range(len(tickers))
        w = 0.28
        ax2.bar([i - w for i in x], hits, w, label="hits",  color="#2f9e44")
        ax2.bar(x,               misses, w, label="misses (pred, но не сделали)",
                color="#f0ad4e")
        ax2.bar([i + w for i in x], extras, w, label="extras (сделали, не pred)",
                color="#6c757d")
        ax2.set_xticks(list(x))
        ax2.set_xticklabels(tickers, rotation=45, ha="right")
        ax2.set_title("Разбивка по тикерам (топ-15 по активности)")
        ax2.legend()
        ax2.grid(axis="y", linestyle=":", alpha=0.5)
    else:
        ax2.text(0.5, 0.5, "нет разметки по тикерам", ha="center", va="center"); ax2.axis("off")

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    return buf.getvalue()
