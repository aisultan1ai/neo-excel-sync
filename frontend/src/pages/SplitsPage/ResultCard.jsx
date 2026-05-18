import React from "react";
import { AlertCircle, CheckCircle } from "lucide-react";

const ResultCard = ({ result }) => {
  if (!result) return null;

  return (
    <div className="card" style={{ marginTop: "20px", borderLeft: result.data.length > 0 ? "5px solid #eab308" : "5px solid #10b981" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        {result.data.length > 0 ? <AlertCircle color="#eab308" size={28} /> : <CheckCircle color="#10b981" size={28} />}
        <div>
          <h3 style={{ margin: 0 }}>{result.data.length > 0 ? `Найдено сплитов: ${result.data.length}` : "Сплитов не обнаружено"}</h3>
          <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "#64748b" }}>
            {result.data.length > 0 ? "Позиции требуют внимания" : "В загруженном файле нет позиций из списка сплитов"}
          </p>
        </div>
      </div>
      {result.data.length > 0 && (
        <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "12px 15px", color: "#475569" }}>ISIN</th>
                <th style={{ padding: "12px 15px", color: "#475569" }}>Счет</th>
                <th style={{ padding: "12px 15px", color: "#475569" }}>Количество</th>
                <th style={{ padding: "12px 15px", color: "#475569" }}>Название ЦБ</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 15px", fontWeight: 500 }}>{row["ISIN"]}</td>
                  <td style={{ padding: "12px 15px" }}>{row["Счет"]}</td>
                  <td style={{ padding: "12px 15px" }}>{row["Количество"]}</td>
                  <td style={{ padding: "12px 15px", color: "#64748b" }}>{row["Полное название ЦБ"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ResultCard;
