import React, { useEffect, useState } from "react";
import axios from "axios";
import { Coins, FileBarChart, Landmark, Lock, Settings, Stethoscope, Wallet } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { T, monthBounds, prevMonthYM } from "./helpers";
import { Tabs } from "./ui";
import ReportTab from "./ReportTab";
import AccountsTab from "./AccountsTab";
import RatesTab from "./RatesTab";
import DiagnosticsTab from "./DiagnosticsTab";
import SettingsTab from "./SettingsTab";

const TABS = [
  ["report", "Отчёт", FileBarChart],
  ["accounts", "Счета и провайдеры", Wallet],
  ["rates", "Курсы", Landmark],
  ["diag", "Проверка данных", Stethoscope],
  ["settings", "Правила", Settings],
];

export default function IncomePage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState("report");
  const [period, setPeriod]   = useState(() => monthBounds(prevMonthYM()));

  useEffect(() => {
    axios.get("/api/v1/profile")
      .then(({ data }) => setAllowed(data.can_income === true))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Загрузка...</div>;

  if (!allowed) {
    return (
      <div style={{ height: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.muted }}>
        <div style={{ background: "#fee2e2", padding: 20, borderRadius: "50%", marginBottom: 20 }}><Lock size={48} color="#ef4444" /></div>
        <h2 style={{ color: T.ink, marginBottom: 10 }}>Доступ ограничен</h2>
        <p style={{ textAlign: "center", maxWidth: 420 }}>Раздел <b>«Доходы»</b> вам недоступен.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      <PageHeader
        title="Доходы по клиентам"
        subtitle="Unity · комиссии (клиент − провайдер), конвертации, mark-up, крипта — по профилям и провайдерам"
        actions={
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#e9f7f4", borderRadius: 8, border: "1px solid #a8e3da" }}>
              <Coins size={15} color={T.blue} />
              <span style={{ fontSize: 12, color: T.blue, fontWeight: 600 }}>Income</span>
            </div>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* вкладки не размонтируем — чтобы не терять загруженный отчёт и прогресс */}
      <div style={{ display: tab === "report" ? undefined : "none" }}>
        <ReportTab period={period} setPeriod={setPeriod} onGoTo={setTab} />
      </div>
      {tab === "accounts" && <AccountsTab period={period} />}
      {tab === "rates" && <RatesTab period={period} />}
      {tab === "diag" && <DiagnosticsTab period={period} />}
      {tab === "settings" && <SettingsTab />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
