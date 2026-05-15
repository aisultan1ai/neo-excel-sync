import React, { useState } from "react";
import { ArrowRightLeft, ClipboardCheck, FileText } from "lucide-react";
import { pageStyles, NavButton } from "./ui";
import ComparisonView from "./ComparisonView";
import ReconcileView from "./ReconcileView";
import ReportView from "./ReportView";

const InstrumentsPage = () => {
  const [viewMode, setViewMode] = useState("compare");

  return (
    <>
      <style>{pageStyles}</style>

      <div
        style={{
          padding: "20px 40px", height: "calc(100vh - 60px)",
          display: "flex", flexDirection: "column",
          background: "#f1f5f9", borderRadius: "16px 0 0 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
          <div>
            <h1 style={{ fontSize: "28px", margin: "0 0 5px 0", color: "#0f172a", fontWeight: 700 }}>Инструменты</h1>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>Управление справочниками и генерация отчетов</p>
          </div>

          <div style={{ background: "#e2e8f0", padding: "4px", borderRadius: "10px", display: "flex", gap: "4px" }}>
            <NavButton active={viewMode === "compare"} onClick={() => setViewMode("compare")} icon={ArrowRightLeft} label="Сверка Инструментов" />
            <NavButton active={viewMode === "reconcile"} onClick={() => setViewMode("reconcile")} icon={ClipboardCheck} label="Сверка Transaction/Trade" />
            <NavButton active={viewMode === "report"} onClick={() => setViewMode("report")} icon={FileText} label="Генератор отчетов VISION" />
          </div>
        </div>

        <div style={{ flex: 1, overflow: "hidden" }}>
          {viewMode === "compare" ? <ComparisonView /> : viewMode === "report" ? <ReportView /> : <ReconcileView />}
        </div>
      </div>
    </>
  );
};

export default InstrumentsPage;
