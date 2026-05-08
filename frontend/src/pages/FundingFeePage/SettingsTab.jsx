import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2, Trash2 } from "lucide-react";
import { Modal, Pill, SectionTitle } from "./ui";
import { T, S } from "./helpers";
import { getUnityConfig, saveUnityConfig, getAllMappings, getMapping, saveMapping } from "./api";

export default function SettingsTab({ accounts, tz = 0, onTzChange }) {
  const [config, setConfig]       = useState({ base_url: "", auth_token: "", has_token: false });
  const [showToken, setShowToken] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [mappings, setMappings]   = useState({});
  const [editMap,  setEditMap]    = useState(null);
  const [savingMap, setSavingMap] = useState(false);

  const loadAllMappings = useCallback(async () => {
    try {
      const { data } = await getAllMappings();
      const m = {};
      (data || []).forEach((item) => { m[item.ff_account_id] = item; });
      setMappings(m);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    getUnityConfig()
      .then(({ data }) => setConfig((p) => ({ ...p, base_url: data.base_url || "", has_token: data.has_token })))
      .catch(() => {});
    loadAllMappings();
  }, [loadAllMappings]);

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      const payload = { base_url: config.base_url };
      if (config.auth_token) payload.auth_token = config.auth_token;
      await saveUnityConfig(payload);
      toast.success("Настройки сохранены");
      setConfig((p) => ({ ...p, auth_token: "", has_token: true }));
    } catch (err) { toast.error(err?.response?.data?.detail || "Ошибка"); }
    finally { setSavingCfg(false); }
  };

  const loadMap = async (accId) => {
    try {
      const { data } = await getMapping(accId);
      setEditMap({ ff_account_id: accId, unity_account_id: data.unity_account_id || "", unity_real_account_id: data.unity_real_account_id || "", unity_asset_id: data.unity_asset_id || "" });
    } catch {
      setEditMap({ ff_account_id: accId, unity_account_id: "", unity_real_account_id: "", unity_asset_id: "" });
    }
  };

  const saveMap = async () => {
    if (!editMap || !editMap.unity_account_id || !editMap.unity_real_account_id || !editMap.unity_asset_id) {
      toast.error("Заполните все поля"); return;
    }
    setSavingMap(true);
    try {
      await saveMapping(editMap.ff_account_id, {
        unity_account_id:      parseInt(editMap.unity_account_id),
        unity_real_account_id: parseInt(editMap.unity_real_account_id),
        unity_asset_id:        parseInt(editMap.unity_asset_id),
      });
      toast.success("Маппинг сохранён");
      setEditMap(null);
      loadAllMappings();
    } catch (err) { toast.error(err?.response?.data?.detail || "Ошибка"); }
    finally { setSavingMap(false); }
  };

  const T_blue = "#3b82f6";

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Часовой пояс</SectionTitle>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ v: 0, l: "UTC+0" }, { v: 5, l: "UTC+5" }].map(({ v, l }) => (
            <label key={v} onClick={() => onTzChange(v)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 8,
                border: `2px solid ${tz === v ? T_blue : T.border}`, background: tz === v ? "#eff6ff" : "#fff",
                cursor: "pointer", transition: "all 0.15s", userSelect: "none" }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${tz === v ? T_blue : T.border}`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {tz === v && <div style={{ width: 7, height: 7, borderRadius: "50%", background: T_blue }} />}
              </div>
              <span style={{ fontSize: 13, fontWeight: tz === v ? 600 : 400, color: tz === v ? T_blue : T.ink }}>{l}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Unity API</SectionTitle>
        <div style={{ maxWidth: 520 }}>
          <div className="input-group" style={{ marginBottom: 14 }}>
            <label className="input-label">Base URL</label>
            <input className="text-input" placeholder="https://rest.unity.finance"
              value={config.base_url} onChange={(e) => setConfig((p) => ({ ...p, base_url: e.target.value }))} />
            {config.base_url && (
              <div style={{ marginTop: 6, fontSize: 11, color: T.muted, fontFamily: "monospace", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px" }}>
                {config.base_url.replace(/\/+$/, "")}/api/v1/cashOut
              </div>
            )}
          </div>
          <div className="input-group" style={{ marginBottom: 20 }}>
            <label className="input-label">
              Auth Token {config.has_token && !config.auth_token && <Pill color="#dcfce7" text="#15803d" style={{ marginLeft: 8 }}>✓ сохранён</Pill>}
            </label>
            <div style={{ position: "relative" }}>
              <input className="text-input" type={showToken ? "text" : "password"}
                placeholder={config.has_token ? "оставьте пустым чтобы не менять" : "введите токен"}
                value={config.auth_token} onChange={(e) => setConfig((p) => ({ ...p, auth_token: e.target.value }))}
                style={{ paddingRight: 38 }} />
              <button type="button" style={S.eyeBtn} onClick={() => setShowToken((p) => !p)}>{showToken ? "🙈" : "👁"}</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" onClick={saveConfig} disabled={savingCfg}>
              {savingCfg ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} /> : null}
              Сохранить
            </button>
            {config.has_token && (
              <button style={{ ...S.ghost, color: T.red, borderColor: "#fca5a5" }} onClick={async () => {
                if (!window.confirm("Удалить сохранённый токен?")) return;
                try {
                  await saveUnityConfig({ base_url: config.base_url, auth_token: "" });
                  toast.success("Токен удалён");
                  setConfig((p) => ({ ...p, has_token: false, auth_token: "" }));
                } catch { toast.error("Ошибка удаления токена"); }
              }}>
                <Trash2 size={13} style={{ marginRight: 5 }} />Удалить токен
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <SectionTitle>Маппинг аккаунтов → Unity</SectionTitle>
        <p style={{ ...T.small, marginBottom: 14 }}>Привяжите каждый Binance аккаунт к соответствующим ID в системе Unity.</p>
        {accounts.length === 0 ? <div style={S.empty}><p style={{ color: T.faint, margin: 0 }}>Нет аккаунтов.</p></div> : (
          <div className="result-table-wrapper">
            <table className="styled-table">
              <thead>
                <tr><th>Binance аккаунт</th><th style={{ textAlign: "right" }}>accountId</th><th style={{ textAlign: "right" }}>realAccountId</th><th style={{ textAlign: "right" }}>assetId</th><th style={{ width: 90 }}></th></tr>
              </thead>
              <tbody>
                {accounts.map((acc) => {
                  const m = mappings[acc.id];
                  return (
                    <tr key={acc.id}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{acc.name}</td>
                      <td style={{ textAlign: "right", fontSize: 13, color: m ? T.ink : T.faint }}>{m?.unity_account_id || "—"}</td>
                      <td style={{ textAlign: "right", fontSize: 13, color: m ? T.ink : T.faint }}>{m?.unity_real_account_id || "—"}</td>
                      <td style={{ textAlign: "right", fontSize: 13, color: m ? T.ink : T.faint }}>{m?.unity_asset_id || "—"}</td>
                      <td>
                        <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => loadMap(acc.id)}>Настроить</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editMap && (
        <Modal title={`Маппинг — ${accounts.find((a) => a.id === editMap.ff_account_id)?.name}`} onClose={() => setEditMap(null)} width={400}>
          <div style={{ padding: "20px 24px 24px" }}>
            {[["unity_account_id","accountId"],["unity_real_account_id","realAccountId"],["unity_asset_id","assetId"]].map(([name, label]) => (
              <div key={name} className="input-group" style={{ marginBottom: 14 }}>
                <label className="input-label">{label}</label>
                <input className="text-input" type="number" min={1} value={editMap[name]}
                  onChange={(e) => setEditMap((p) => ({ ...p, [name]: e.target.value }))} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={S.ghost} onClick={() => setEditMap(null)}>Отмена</button>
              <button className="btn" onClick={saveMap} disabled={savingMap}>
                {savingMap ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Сохранить"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
