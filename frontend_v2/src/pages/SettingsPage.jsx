import React, { useEffect, useMemo, useState } from "react";
import { Save, Upload, Lock, Settings, Shield, Key, TrendingUp, Layers, Database } from "lucide-react";
import { toast } from "react-toastify";
import { api } from "../api/client";

const TABS = [
  { id: "general", label: "Общие", icon: Settings },
  { id: "podft", label: "ПОД/ФТ", icon: Shield },
  { id: "crypto", label: "Крипто", icon: Key },
  { id: "bonds", label: "Бонды", icon: TrendingUp },
  { id: "splits", label: "Сплиты", icon: Layers },
  { id: "database", label: "Исключения", icon: Database },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = useMemo(() => {
    if (!profile) return false;
    return profile.is_admin || profile.department === "Back Office";
  }, [profile]);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, profileRes] = await Promise.all([
          api.get("/api/v2/settings"),
          api.get("/api/v2/profile"),
        ]);

        setSettings(settingsRes.data);
        setProfile(profileRes.data);
      } catch (error) {
        toast.error(error?.response?.data?.detail || "Ошибка загрузки настроек");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function handleChange(key, value) {
    if (!canEdit) return;
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleToggle(key) {
    if (!canEdit) return;
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleArrayChange(key, value) {
    if (!canEdit) return;
    const array = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    setSettings((prev) => ({ ...prev, [key]: array }));
  }

  function handleOverlapChange(value) {
    if (!canEdit) return;
    const array = value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    setSettings((prev) => ({ ...prev, overlap_accounts: array }));
  }

  async function handleSplitFileSelect(event) {
    if (!canEdit) return;

    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post("/api/v2/settings/upload-split-list", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setSettings((prev) => ({
        ...prev,
        split_list_path: data.path || data.new_path || prev.split_list_path,
      }));

      toast.success("Файл сплитов обновлен");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка загрузки файла");
    } finally {
      event.target.value = "";
    }
  }

  async function saveSettings() {
    if (!canEdit || !settings) return;

    setSaving(true);
    try {
      const { data } = await api.post("/api/v2/settings", { data: settings });
      setSettings(data.settings);
      toast.success("Настройки сохранены");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Настройки</h1>
        <div className="card">Загрузка...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="page">
        <h1>Настройки</h1>
        <div className="card">Не удалось загрузить настройки.</div>
      </div>
    );
  }

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <div>
          <h1>Настройки</h1>
          <p className="settings-subtitle">Управление параметрами системы</p>
        </div>

        {!canEdit && (
          <div className="readonly-badge">
            <Lock size={16} />
            <span>Только чтение ({profile?.is_admin ? "Admin" : profile?.department})</span>
          </div>
        )}
      </div>

      <div className="settings-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab ${active ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="card settings-card">
        {activeTab === "general" && (
          <>
            <h3>Основные параметры</h3>

            <div className="form-group">
              <label>Варианты названия столбца ID</label>
              <input
                value={(settings.default_id_names || []).join(", ")}
                disabled={!canEdit}
                onChange={(e) => handleArrayChange("default_id_names", e.target.value)}
              />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Счет в Unity</label>
                <input
                  value={settings.default_acc_name_unity || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("default_acc_name_unity", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Счет в АИС</label>
                <input
                  value={settings.default_acc_name_ais || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("default_acc_name_ais", e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === "podft" && (
          <>
            <h3>Финансовый мониторинг</h3>

            <div className="grid-2">
              <div className="form-group">
                <label>Колонка суммы</label>
                <input
                  value={settings.podft_sum_col || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("podft_sum_col", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Порог</label>
                <input
                  value={settings.podft_threshold || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("podft_threshold", e.target.value)}
                />
              </div>
            </div>

            <div className="toggle-row">
              <span>Фильтр исключений</span>
              <input
                type="checkbox"
                checked={Boolean(settings.podft_filter_enabled)}
                disabled={!canEdit}
                onChange={() => handleToggle("podft_filter_enabled")}
              />
            </div>

            {settings.podft_filter_enabled && (
              <div className="grid-2">
                <div className="form-group">
                  <label>Колонка фильтра</label>
                  <input
                    value={settings.podft_filter_col || ""}
                    disabled={!canEdit}
                    onChange={(e) => handleChange("podft_filter_col", e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Исключать значения</label>
                  <input
                    value={settings.podft_filter_values || ""}
                    disabled={!canEdit}
                    onChange={(e) => handleChange("podft_filter_values", e.target.value)}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "crypto" && (
          <>
            <div className="toggle-row">
              <h3>Крипто</h3>
              <input
                type="checkbox"
                checked={Boolean(settings.crypto_enabled)}
                disabled={!canEdit}
                onChange={() => handleToggle("crypto_enabled")}
              />
            </div>

            <div className="form-group">
              <label>Колонка поиска</label>
              <input
                value={settings.crypto_col || ""}
                disabled={!canEdit}
                onChange={(e) => handleChange("crypto_col", e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Ключевые слова</label>
              <textarea
                rows={5}
                value={settings.crypto_keywords || ""}
                disabled={!canEdit}
                onChange={(e) => handleChange("crypto_keywords", e.target.value)}
              />
            </div>
          </>
        )}

        {activeTab === "bonds" && (
          <>
            <div className="toggle-row">
              <h3>Бонды и опционы</h3>
              <input
                type="checkbox"
                checked={Boolean(settings.bo_enabled)}
                disabled={!canEdit}
                onChange={() => handleToggle("bo_enabled")}
              />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Колонка Instrument</label>
                <input
                  value={settings.bo_unity_instrument_col || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("bo_unity_instrument_col", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Колонка суммы</label>
                <input
                  value={settings.bo_ais_sum_col || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("bo_ais_sum_col", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Порог</label>
                <input
                  value={settings.bo_threshold || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("bo_threshold", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Префиксы</label>
                <input
                  value={settings.bo_prefixes || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("bo_prefixes", e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === "splits" && (
          <>
            <div className="toggle-row">
              <h3>Сплиты</h3>
              <input
                type="checkbox"
                checked={Boolean(settings.split_check_enabled)}
                disabled={!canEdit}
                onChange={() => handleToggle("split_check_enabled")}
              />
            </div>

            <div className="form-group">
              <label>Файл справочника</label>
              <div className="file-row">
                <input
                  value={settings.split_list_path ? settings.split_list_path.split(/[\\/]/).pop() : "Нет файла"}
                  disabled
                />
                {canEdit && (
                  <label className="upload-btn">
                    <Upload size={16} />
                    <span>Загрузить</span>
                    <input
                      type="file"
                      hidden
                      accept=".xlsx,.xls,.csv"
                      onChange={handleSplitFileSelect}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="grid-3">
              <div className="form-group">
                <label>Столбец ISIN</label>
                <input
                  value={settings.split_list_isin_col || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("split_list_isin_col", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Столбец ЦБ</label>
                <input
                  value={settings.daily_file_security_col || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("daily_file_security_col", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Столбец Кол-во</label>
                <input
                  value={settings.split_daily_qty_col || ""}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("split_daily_qty_col", e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === "database" && (
          <>
            <h3>Счета исключения</h3>
            <div className="form-group">
              <label>Overlap accounts</label>
              <textarea
                rows={10}
                value={(settings.overlap_accounts || []).join("\n")}
                disabled={!canEdit}
                onChange={(e) => handleOverlapChange(e.target.value)}
              />
            </div>
          </>
        )}

        {canEdit && (
          <div className="settings-actions">
            <button type="button" className="save-btn" onClick={saveSettings} disabled={saving}>
              <Save size={18} />
              <span>{saving ? "Сохранение..." : "Сохранить изменения"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}