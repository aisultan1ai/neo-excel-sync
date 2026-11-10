import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { getSettings, saveSettings } from "./api";
import { S, T, errText } from "./helpers";

const LISTS = [
  ["conversion_categories", "Конвертация: категории инструмента", "Например CASH"],
  ["conversion_prefixes", "Конвертация: префикс тикера/кода", "Например CASH. (CASH.USDRUB)"],
  ["crypto_categories", "Крипта: категории инструмента", "Например CR"],
  ["crypto_prefixes", "Крипта: префикс тикера/кода", "Например CR. — без точки CR поймает и акции вроде CRM"],
  ["trade_types", "Типы сделок для загрузки", "tradeType Unity: DIRECT, CONVERSION…"],
  ["transaction_types", "Типы транзакций для загрузки", "FUNDING_FEE — доход; TRADE_COMMISSION — для сверки, можно убрать"],
];

const NUMBERS = [
  ["match_window_sec", "Окно авто-сопоставления, сек", "Если нет Execution ID: тот же инструмент, сторона, объём и время ± N сек"],
  ["order_details_limit", "Лимит запросов Execution ID за загрузку", "Каждый ордер запрашивается один раз, дальше — из базы"],
  ["accounts_per_request", "Счетов в одном запросе", "Меньше запросов = меньше расход лимита Unity"],
];

const toText = (v) => (Array.isArray(v) ? v.join(", ") : v ?? "");

export default function SettingsTab() {
  const [form, setForm]         = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [saving, setSaving]     = useState(false);

  const fill = (s) => {
    const f = {};
    Object.entries(s).forEach(([k, v]) => { f[k] = toText(v); });
    setForm(f);
  };

  useEffect(() => {
    getSettings()
      .then(({ data }) => { fill(data.settings); setDefaults(data.defaults); })
      .catch(() => toast.error("Ошибка загрузки правил"));
  }, []);

  const handleSave = async () => {
    const payload = {};
    LISTS.forEach(([k]) => { payload[k] = form[k].split(",").map((x) => x.trim()).filter(Boolean); });
    NUMBERS.forEach(([k]) => { payload[k] = Number(form[k]); });
    payload.order_details_scope = form.order_details_scope;
    setSaving(true);
    try {
      const { data } = await saveSettings(payload);
      fill(data.settings);
      toast.success("Правила сохранены. Новые правила классификации применяются сразу; типы сделок/транзакций — при следующей загрузке.");
    } catch (err) { toast.error(errText(err, "Ошибка сохранения")); }
    finally { setSaving(false); }
  };

  if (!form) return <div style={{ padding: 30, textAlign: "center" }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /></div>;

  const field = (k, label, hint, type = "text") => (
    <div key={k} className="input-group" style={{ margin: 0 }}>
      <label className="input-label">{label}</label>
      <input className="text-input" type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ width: "100%" }} />
      <div style={{ ...T.small, fontSize: 11, marginTop: 3 }}>{hint}</div>
    </div>
  );

  return (
    <div className="card">
      <div style={{ ...T.small, marginBottom: 14, lineHeight: 1.6 }}>
        Как считается доход: <b>комиссия</b> = комиссия клиента − комиссия парной сделки провайдера; <b>конвертация</b> = разница курсов клиента
        и провайдера × объём; <b>mark-up</b> = markupAmount сделки; <b>крипта</b> = чистая комиссия + mark-up по крипто-инструментам;
        <b> funding fee</b> с клиентских счетов — в комиссионный доход. Списки — через запятую.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {LISTS.map(([k, l, h]) => field(k, l, h))}
        {NUMBERS.map(([k, l, h]) => field(k, l, h, "number"))}
        <div className="input-group" style={{ margin: 0 }}>
          <label className="input-label">Execution ID запрашивать для</label>
          <select className="text-input" value={form.order_details_scope} onChange={(e) => setForm({ ...form, order_details_scope: e.target.value })} style={{ width: "100%" }}>
            <option value="conversion">Только конвертаций (быстро)</option>
            <option value="all">Всех сделок клиентов (точнее, но больше запросов)</option>
          </select>
          <div style={{ ...T.small, fontSize: 11, marginTop: 3 }}>Остальные сделки сопоставляются по времени/объёму без запросов</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button className="btn" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} /> : <Save size={14} style={{ marginRight: 6 }} />}
          Сохранить
        </button>
        {defaults && <button style={S.ghost} onClick={() => fill(defaults)}><RotateCcw size={14} /> По умолчанию</button>}
      </div>
    </div>
  );
}
