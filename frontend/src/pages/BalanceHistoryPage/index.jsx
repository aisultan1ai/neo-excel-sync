import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { BarChart3, Lock, ShieldAlert } from "lucide-react";
import { TabNav } from "./ui";
import { T } from "./helpers";
import { listAccounts } from "./api";
import AccountsTab from "./AccountsTab";
import DataTab     from "./DataTab";
import SettingsTab from "./SettingsTab";

export default function BalanceHistoryPage() {
  const [userDept,    setUserDept]    = useState(null);
  const [isAdmin,     setIsAdmin]     = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab,   setActiveTab]   = useState("data");
  const [accounts,    setAccounts]    = useState([]);

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await listAccounts();
      setAccounts(data || []);
    } catch { toast.error("Ошибка загрузки счетов"); }
  }, []);

  useEffect(() => {
    axios.get("/api/v1/profile")
      .then(({ data }) => {
        setUserDept(data.department);
        setIsAdmin(data.is_admin);
        if (data.department === "Back Office" || data.is_admin) loadAccounts();
      })
      .catch(console.error)
      .finally(() => setLoadingAuth(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingAuth) return <div style={{ padding: 40, textAlign: "center" }}>Загрузка...</div>;

  if (userDept !== "Back Office" && !isAdmin) {
    return (
      <div style={{ height: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        <div style={{ background: "#fee2e2", padding: "20px", borderRadius: "50%", marginBottom: "20px" }}>
          <Lock size={48} color="#ef4444" />
        </div>
        <h2 style={{ color: "#1e293b", marginBottom: "10px" }}>Доступ ограничен</h2>
        <p style={{ textAlign: "center", maxWidth: "400px" }}>
          Раздел <b>"Остатки"</b> доступен только для сотрудников департамента
          <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", marginLeft: "5px", fontWeight: 600 }}>Back Office</span>.
        </p>
        <div style={{ marginTop: "20px", fontSize: "13px", display: "flex", alignItems: "center", gap: "5px" }}>
          <ShieldAlert size={16} /> Ваш отдел: <b>{userDept}</b>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em" }}>Остатки</h1>
          <p style={{ margin: "3px 0 0", ...T.small }}>
            Unity · Остатки по счетам · {accounts.length} {accounts.length === 1 ? "счёт" : accounts.length < 5 ? "счёта" : "счетов"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
          <BarChart3 size={15} color={T.blue} />
          <span style={{ fontSize: 12, color: T.blue, fontWeight: 600 }}>Balance History</span>
        </div>
      </div>

      <TabNav active={activeTab} onChange={setActiveTab} />

      <div style={{ display: activeTab === "accounts" ? undefined : "none" }}>
        <AccountsTab accounts={accounts} onRefresh={loadAccounts} />
      </div>
      <div style={{ display: activeTab === "data" ? undefined : "none" }}>
        <DataTab accounts={accounts} />
      </div>
      <div style={{ display: activeTab === "settings" ? undefined : "none" }}>
        <SettingsTab />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
