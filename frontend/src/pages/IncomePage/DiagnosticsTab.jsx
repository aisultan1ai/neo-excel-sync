import React, { useState } from "react";
import { toast } from "react-toastify";
import { Loader2, Stethoscope } from "lucide-react";
import { getDiagnostics } from "./api";
import { MATCH_LABELS, S, T, errText, fmtDate, fmtNum } from "./helpers";
import { DataTable, StatTile } from "./ui";

const KIND = { other: "Сделки ЦБ / mark-up", conversion: "Конвертации", crypto: "Крипта" };

export default function DiagnosticsTab({ period }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await getDiagnostics(period.from, period.to);
      setData(data);
    } catch (err) { toast.error(errText(err, "Ошибка проверки")); }
    finally { setLoading(false); }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ ...T.small, marginBottom: 10, lineHeight: 1.6 }}>
          Для сверки логики на реальных данных: сколько сделок нашли пару у провайдера, какие типы транзакций пришли,
          как классифицированы инструменты (конвертация / крипта / прочее) и какие счета самые «тяжёлые» — их можно исключить.
        </div>
        <button className="btn" onClick={run} disabled={loading}>
          {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} /> : <Stethoscope size={14} style={{ marginRight: 6 }} />}
          Проверить {fmtDate(period.from)} — {fmtDate(period.to)}
        </button>
      </div>

      {data && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            {Object.entries(data.match_stats).map(([k, s]) => (
              <StatTile key={k} label={KIND[k]} value={`${s.execution + s.auto} / ${s.total}`}
                sub={`пара: Execution ID ${s.execution} · авто ${s.auto} · нет ${s.none}`}
                color={s.none ? T.amber : T.green} />
            ))}
            <StatTile label="Сделок провайдеров" value={data.counts.provider_trades} />
            <StatTile label="Funding fee строк" value={data.funding_rows} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Транзакции по типам</h3>
            <DataTable search={false} rows={data.transactions} columns={[
              { key: "type", label: "Тип" },
              { key: "sub_type", label: "Подтип" },
              { key: "currency", label: "Валюта" },
              { key: "cnt", label: "Кол-во", num: true },
              { key: "amount", label: "Сумма", num: true, render: (v) => fmtNum(v, 2) },
            ]} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Инструменты периода</h3>
            <DataTable rows={data.instruments} maxHeight={400} columns={[
              { key: "id", label: "ID" },
              { key: "ticker", label: "Тикер" },
              { key: "code", label: "Код" },
              { key: "category", label: "Категория" },
              { key: "base", label: "База" },
              { key: "quote", label: "Котир." },
              { key: "kind", label: "Учтён как", render: (v) => ({ conversion: "Конвертация", crypto: "Крипта", other: "Сделки / mark-up" }[v] || v) },
            ]} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Счета с наибольшим числом сделок</h3>
            <DataTable search={false} rows={data.heavy_accounts} columns={[
              { key: "account_id", label: "Счёт" },
              { key: "name", label: "Имя" },
              { key: "profile", label: "Профиль" },
              { key: "trades", label: "Сделок", num: true },
              { key: "excluded", label: "Исключён", render: (v) => (v ? "да" : "") },
            ]} />
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Сделки клиентов без пары у провайдера (до 200)</h3>
            <DataTable rows={data.unmatched} maxHeight={400} columns={[
              { key: "transact_time", label: "Время", render: (v) => (v || "").slice(0, 19).replace("T", " ") },
              { key: "trade_id", label: "Trade ID" },
              { key: "account", label: "Счёт" },
              { key: "instrument", label: "Инструмент" },
              { key: "side", label: "Стор." },
              { key: "amount", label: "Объём", num: true, render: (v) => fmtNum(v) },
              { key: "price", label: "Цена", num: true, render: (v) => fmtNum(v) },
              { key: "client_commission", label: "Комиссия", num: true, render: (v) => fmtNum(v, 4) },
              { key: "markup_amount", label: "markupAmount", num: true, render: (v) => fmtNum(v, 4) },
              { key: "match", label: "Пара", render: (v) => MATCH_LABELS[v] || v },
            ]} />
          </div>
        </>
      )}
      {!data && !loading && (
        <div style={S.empty}><span style={{ color: T.faint, fontSize: 13 }}>Сначала загрузите период во вкладке «Отчёт».</span></div>
      )}
    </>
  );
}
