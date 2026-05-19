import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2, Trash2 } from "lucide-react";
import { SectionTitle, Pill } from "./ui";
import { T, S } from "./helpers";
import { getUnityConfig, saveUnityConfig } from "./api";

export default function SettingsTab() {
  const [config,    setConfig]    = useState({ base_url: "", auth_token: "", has_token: false });
  const [showToken, setShowToken] = useState(false);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    getUnityConfig()
      .then(({ data }) => setConfig((p) => ({ ...p, base_url: data.base_url || "", has_token: data.has_token })))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { base_url: config.base_url };
      if (config.auth_token) payload.auth_token = config.auth_token;
      await saveUnityConfig(payload);
      toast.success("Настройки сохранены");
      setConfig((p) => ({ ...p, auth_token: "", has_token: true }));
    } catch (err) { toast.error(err?.response?.data?.detail || "Ошибка"); }
    finally { setSaving(false); }
  };

  const T_blue = "#3b82f6";

  return (
    <div>
      <div className="card">
        <SectionTitle>Unity API</SectionTitle>
        <p style={{ ...T.small, marginBottom: 16 }}>
          Настройки общие с разделом Funding Fee — изменения здесь отразятся там и наоборот.
        </p>
        <div style={{ maxWidth: 520 }}>
          <div className="input-group" style={{ marginBottom: 14 }}>
            <label className="input-label">Base URL</label>
            <input className="text-input" placeholder="https://rest.unity.finance"
              value={config.base_url} onChange={(e) => setConfig((p) => ({ ...p, base_url: e.target.value }))} />
            {config.base_url && (
              <div style={{ marginTop: 6, fontSize: 11, color: T.muted, fontFamily: "monospace", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px" }}>
                {config.base_url.replace(/\/+$/, "")}/api/v1/balanceHistory
              </div>
            )}
          </div>
          <div className="input-group" style={{ marginBottom: 20 }}>
            <label className="input-label">
              Auth Token{" "}
              {config.has_token && !config.auth_token && (
                <Pill color="#dcfce7" text="#15803d" style={{ marginLeft: 8 }}>✓ сохранён</Pill>
              )}
            </label>
            <div style={{ position: "relative" }}>
              <input className="text-input" type={showToken ? "text" : "password"}
                placeholder={config.has_token ? "оставьте пустым чтобы не менять" : "введите токен"}
                value={config.auth_token} onChange={(e) => setConfig((p) => ({ ...p, auth_token: e.target.value }))}
                style={{ paddingRight: 38 }} />
              <button type="button" style={S.eyeBtn} onClick={() => setShowToken((p) => !p)}>
                {showToken ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6 }} /> : null}
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
    </div>
  );
}
