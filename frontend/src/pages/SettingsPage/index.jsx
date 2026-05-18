import React, { useState, useEffect } from "react";
import axios from "axios";
import { Save, Settings, Shield, Key, TrendingUp, Layers, Database, Lock } from "lucide-react";
import { toast } from "react-toastify";
import GeneralTab from "./tabs/GeneralTab";
import PodftTab from "./tabs/PodftTab";
import CryptoTab from "./tabs/CryptoTab";
import BondsTab from "./tabs/BondsTab";
import SplitsTab from "./tabs/SplitsTab";
import DatabaseTab from "./tabs/DatabaseTab";

const TABS = [
  { id: "general", label: "Общие", icon: Settings },
  { id: "podft", label: "ПОД/ФТ", icon: Shield },
  { id: "crypto", label: "Крипто", icon: Key },
  { id: "bonds", label: "Бонды", icon: TrendingUp },
  { id: "splits", label: "Сплиты", icon: Layers },
  { id: "database", label: "Исключения", icon: Database },
];

const SettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [canEdit, setCanEdit] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [settingsRes, profileRes] = await Promise.all([axios.get("/api/v1/settings"), axios.get("/api/v1/profile")]);
        setSettings(settingsRes.data);
        const { department, is_admin } = profileRes.data;
        setCanEdit(!!is_admin && department !== "Back Office");
        setUserRole(is_admin ? "Admin" : department);
      } catch (err) {
        console.error(err);
        toast.error("Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleChange = (key, value) => { if (!canEdit) return; setSettings((prev) => ({ ...prev, [key]: value })); };
  const handleToggle = (key) => { if (!canEdit) return; setSettings((prev) => ({ ...prev, [key]: !prev[key] })); };
  const handleArrayChange = (key, value) => {
    if (!canEdit) return;
    setSettings((prev) => ({ ...prev, [key]: value.split(",").map((item) => item.trim()) }));
  };
  const handleOverlapChange = (e) => {
    if (!canEdit) return;
    setSettings((prev) => ({ ...prev, overlap_accounts: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }));
  };
  const handleSplitFileSelect = async (e) => {
    if (!canEdit) return;
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const toastId = toast.loading("Загрузка...");
    try {
      const res = await axios.post("/api/v1/settings/upload-split-list", formData);
      setSettings((prev) => ({ ...prev, split_list_path: res.data.new_path }));
      toast.update(toastId, { render: "Файл обновлен", type: "success", isLoading: false, autoClose: 2000 });
    } catch {
      toast.update(toastId, { render: "Ошибка", type: "error", isLoading: false, autoClose: 2000 });
    }
  };
  const saveSettings = async () => {
    if (!canEdit) return;
    setSaving(true);
    try { await axios.post("/api/v1/settings", settings); toast.success("Настройки сохранены"); }
    catch { toast.error("Ошибка сохранения"); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 50, textAlign: "center", color: "#64748b" }}>Загрузка параметров...</div>;

  const tabProps = { settings, canEdit, handleChange, handleToggle, handleArrayChange, handleOverlapChange, handleSplitFileSelect };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "60px" }}>
      <div style={{ marginBottom: "25px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <h1 style={{ fontSize: "32px", margin: "0 0 10px 0", color: "#1e293b" }}>Настройки</h1>
          <p style={{ color: "#64748b", margin: 0 }}>Управление параметрами системы</p>
        </div>
        {!canEdit && (
          <div style={{ background: "#fef2f2", color: "#ef4444", padding: "8px 15px", borderRadius: "8px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px", border: "1px solid #fecaca" }}>
            <Lock size={16} /><span>Только чтение ({userRole})</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "5px", marginBottom: "25px", justifyContent: "center", flexWrap: "wrap" }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "25px", border: "1px solid", borderColor: isActive ? "#3b82f6" : "#e2e8f0", background: isActive ? "#3b82f6" : "white", color: isActive ? "white" : "#64748b", fontWeight: 600, fontSize: "14px", cursor: "pointer", transition: "all 0.2s ease", boxShadow: isActive ? "0 4px 6px -1px rgba(0,0,0,0.1)" : "none" }}>
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="card" style={{ padding: "40px", minHeight: "300px", borderTop: "4px solid #3b82f6", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)" }}>
        {activeTab === "general" && <GeneralTab {...tabProps} />}
        {activeTab === "podft" && <PodftTab {...tabProps} />}
        {activeTab === "crypto" && <CryptoTab {...tabProps} />}
        {activeTab === "bonds" && <BondsTab {...tabProps} />}
        {activeTab === "splits" && <SplitsTab {...tabProps} />}
        {activeTab === "database" && <DatabaseTab {...tabProps} />}

        {canEdit && (
          <div style={{ marginTop: "30px", borderTop: "1px solid #e2e8f0", paddingTop: "20px", display: "flex", justifyContent: "flex-end" }}>
            <button className="btn" onClick={saveSettings} disabled={saving} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 30px", fontSize: "16px", background: "#3b82f6", color: "white", border: "none", boxShadow: "0 4px 6px -1px rgba(59,130,246,0.3)" }}>
              <Save size={20} /> {saving ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>
        )}
      </div>

      <style>{`
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .switch { position: relative; display: inline-block; width: 40px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; border-radius: 24px; }
        .slider.disabled { cursor: not-allowed; opacity: 0.6; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #3b82f6; }
        input:checked + .slider.disabled { background-color: #93c5fd; }
        input:checked + .slider:before { transform: translateX(16px); }
        .text-input:disabled { background-color: #f1f5f9; color: #94a3b8; cursor: not-allowed; }
      `}</style>
    </div>
  );
};

export default SettingsPage;
