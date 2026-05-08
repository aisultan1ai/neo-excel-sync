import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Plus } from "lucide-react";
import { TabNav } from "./ui";
import { T } from "./helpers";
import { getAccounts, deleteAccount as apiDeleteAccount } from "./api";
import AccountsTab    from "./AccountsTab";
import DataTab        from "./DataTab";
import HistoryTab     from "./HistoryTab";
import ScheduleTab    from "./ScheduleTab";
import SettingsTab    from "./SettingsTab";
import AddAccountModal from "./AddAccountModal";

export default function FundingFeePage() {
  const [activeTab,    setActiveTab]    = useState("accounts");
  const [accounts,     setAccounts]     = useState([]);
  const [showAdd,      setShowAdd]      = useState(false);
  const [tz,           setTz]           = useState(() => parseInt(localStorage.getItem("ff_tz") ?? "5"));
  const [selAccountId, setSelAccountId] = useState(
    () => sessionStorage.getItem("ff_sel_account_id") || ""
  );

  const handleTzChange = (v) => {
    setTz(v);
    localStorage.setItem("ff_tz", String(v));
  };

  const loadAccounts = useCallback(async () => {
    try { const { data } = await getAccounts(); setAccounts(data || []); }
    catch { toast.error("Ошибка загрузки аккаунтов"); }
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const selectAccount = (id) => {
    setSelAccountId(id);
    if (id) sessionStorage.setItem("ff_sel_account_id", id);
    else sessionStorage.removeItem("ff_sel_account_id");
  };

  const deleteAccount = async (id, name) => {
    if (!window.confirm(`Удалить аккаунт "${name}" и все его записи?`)) return;
    try {
      await apiDeleteAccount(id);
      toast.success("Аккаунт удалён");
      setAccounts((p) => p.filter((a) => a.id !== id));
      if (String(selAccountId) === String(id)) selectAccount("");
    } catch { toast.error("Ошибка удаления"); }
  };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em" }}>Funding Fee</h1>
          <p style={{ margin: "3px 0 0", ...T.small }}>Binance Futures · Загрузка, анализ, Cash In / Out</p>
        </div>
        {activeTab === "accounts" && (
          <button className="btn" onClick={() => setShowAdd(true)}>
            <Plus size={14} style={{ marginRight: 6 }} />Добавить аккаунт
          </button>
        )}
      </div>

      <TabNav active={activeTab} onChange={setActiveTab} />

      <div style={{ display: activeTab === "accounts" ? undefined : "none" }}>
        <AccountsTab accounts={accounts} selAccountId={selAccountId}
          onSelect={(id) => { selectAccount(id); setActiveTab("data"); }}
          onDelete={deleteAccount} />
      </div>
      <div style={{ display: activeTab === "data"     ? undefined : "none" }}>
        <DataTab accounts={accounts} selAccountId={selAccountId} onSelect={selectAccount} onAccountsRefresh={loadAccounts} tz={tz} />
      </div>
      <div style={{ display: activeTab === "history"  ? undefined : "none" }}>
        <HistoryTab accounts={accounts} tz={tz} />
      </div>
      <div style={{ display: activeTab === "schedule" ? undefined : "none" }}>
        <ScheduleTab accounts={accounts} />
      </div>
      <div style={{ display: activeTab === "settings" ? undefined : "none" }}>
        <SettingsTab accounts={accounts} tz={tz} onTzChange={handleTzChange} />
      </div>

      {showAdd && (
        <AddAccountModal onClose={() => setShowAdd(false)}
          onSaved={(acc) => { setAccounts((p) => [...p, acc]); loadAccounts(); }} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
