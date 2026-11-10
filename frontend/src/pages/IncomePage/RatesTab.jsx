import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Copy, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { getRates, saveRates } from "./api";
import { S, T, errText, monthOf } from "./helpers";

const CCYUSD = ["EUR", "GBP", "AUD", "NZD", "XAU", "XAG"];
const defaultMode = (c) => (CCYUSD.includes((c || "").toUpperCase()) ? "CCYUSD" : "USDCCY");
const pair = (c, mode) => (mode === "CCYUSD" ? `${c || "CCY"}USD` : `USD${c || "CCY"}`);

export default function RatesTab({ period }) {
  const [month, setMonth]   = useState(monthOf(period.to));
  const [rows, setRows]     = useState([]);
  const [prev, setPrev]     = useState({ month: null, rates: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const inPeriod = monthOf(period.to) === month;
      const { data } = await getRates(`${month}-01`, inPeriod ? period.from : undefined, inPeriod ? period.to : undefined);
      setRows(data.rates.map((r) => ({ currency: r.currency, rate: r.rate ?? "", mode: r.mode, missing: r.missing })));
      setPrev({ month: data.previous_month, rates: data.previous });
    } catch (err) { toast.error(errText(err, "Ошибка загрузки курсов")); }
    finally { setLoading(false); }
  }, [month, period]);

  useEffect(() => { if (month) load(); }, [load, month]);

  const update = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const copyPrev = () => {
    setRows((rs) => {
      const have = new Map(rs.map((r) => [r.currency, r]));
      prev.rates.forEach((p) => {
        const cur = have.get(p.currency);
        if (!cur || cur.rate === "" || cur.rate == null) have.set(p.currency, { currency: p.currency, rate: p.rate, mode: p.mode });
      });
      return [...have.values()].sort((a, b) => a.currency.localeCompare(b.currency));
    });
  };

  const handleSave = async () => {
    const clean = rows.filter((r) => r.currency && r.rate !== "" && r.rate != null);
    const bad = clean.find((r) => !(Number(r.rate) > 0));
    if (bad) { toast.warn(`Неверный курс для ${bad.currency}`); return; }
    setSaving(true);
    try {
      await saveRates(`${month}-01`, clean.map((r) => ({ currency: r.currency.toUpperCase(), rate: Number(r.rate), mode: r.mode })));
      toast.success("Курсы сохранены");
      load();
    } catch (err) { toast.error(errText(err, "Ошибка сохранения")); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
      <div style={{ ...T.small, marginBottom: 12, lineHeight: 1.6 }}>
        Курсы на конец месяца для пересчёта в USD. Суммы в отчёте хранятся в исходной валюте, USD считается по этим курсам.
        Для отчёта берётся месяц даты «по». Конвертации с участием USD считаются по курсу самой сделки, без этой таблицы.<br />
        Валюты, которых не хватает для выбранного периода, подсвечены.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <div className="input-group" style={{ margin: 0 }}>
          <label className="input-label">Месяц</label>
          <input className="text-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }} />
        </div>
        <button style={S.ghost} onClick={() => setRows((rs) => [...rs, { currency: "", rate: "", mode: "USDCCY" }])}>
          <Plus size={14} /> Валюта
        </button>
        {prev.month && (
          <button style={S.ghost} onClick={copyPrev} title="Подставить курсы прошлого месяца в пустые строки">
            <Copy size={14} /> Из {prev.month.slice(0, 7)}
          </button>
        )}
        <button className="btn" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} /> : <Save size={14} style={{ marginRight: 6 }} />}
          Сохранить
        </button>
        {loading && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
      </div>

      {!rows.length ? (
        <div style={S.empty}><span style={{ color: T.faint, fontSize: 13 }}>Курсов за месяц нет. Добавьте валюту или скопируйте из прошлого месяца.</span></div>
      ) : (
        <table style={{ borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>{["Валюта", "Котировка", "Пара", "Курс", ""].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: r.missing && (r.rate === "" || r.rate == null) ? "#fffbeb" : undefined }}>
                <td style={S.td}>
                  <input className="text-input" value={r.currency} style={{ width: 90, textTransform: "uppercase" }}
                    onChange={(e) => { const c = e.target.value.toUpperCase(); update(i, { currency: c, mode: r.currency ? r.mode : defaultMode(c) }); }} />
                </td>
                <td style={S.td}>
                  <select className="text-input" value={r.mode} onChange={(e) => update(i, { mode: e.target.value })} style={{ width: 200 }}>
                    <option value="USDCCY">1 USD = x {r.currency || "CCY"}</option>
                    <option value="CCYUSD">1 {r.currency || "CCY"} = x USD</option>
                  </select>
                </td>
                <td style={{ ...S.td, fontWeight: 600 }}>{pair(r.currency, r.mode)}</td>
                <td style={S.td}>
                  <input className="text-input" type="number" step="any" value={r.rate} style={{ width: 140 }}
                    onChange={(e) => update(i, { rate: e.target.value })} placeholder={r.missing ? "нужен курс" : ""} />
                </td>
                <td style={S.td}>
                  <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: T.faint, display: "flex" }}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
