import React from "react";
import { X, Edit, Mail, Briefcase, Upload, FileText, Download, Trash2 } from "lucide-react";
import { STATUS_STYLES, STATUS_DB_MAP } from "./constants";

const ClientDrawer = ({ isOpen, client, details, onClose, onEdit, onStatusChange, onFileUpload, onFileDownload, onFileDelete, onDeleteClient }) => {
  return (
    <>
      {isOpen && (
        <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 40 }} />
      )}
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100%", width: "500px", maxWidth: "85vw",
        backgroundColor: "white", boxShadow: "-10px 0 30px rgba(0,0,0,0.15)",
        transform: isOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)", zIndex: 50, display: "flex", flexDirection: "column",
      }}>
        {client && (
          <>
            <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
              <h2 style={{ margin: 0, fontSize: "20px" }}>Карточка клиента</h2>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={24} color="#64748b" />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "25px" }}>
              {!details ? (
                <div style={{ textAlign: "center", marginTop: "50px", color: "#94a3b8" }}>Загрузка данных...</div>
              ) : (
                <>
                  <div style={{ marginBottom: "30px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "15px" }}>
                      <h3 style={{ margin: 0, fontSize: "22px", color: "#1e293b" }}>{details.name}</h3>
                      <button onClick={onEdit} title="Редактировать" style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }}>
                        <Edit size={20} />
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "15px", background: "white", padding: "15px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <Mail size={16} color="#94a3b8" />
                        <span style={{ color: "#334155" }}>{details.email || "Email не указан"}</span>
                      </div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <Briefcase size={16} color="#94a3b8" />
                        <span style={{ color: "#334155" }}>{details.account_number || "Счет не указан"}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "30px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Статус отчетов</label>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {["Нет", "В ожидании", "Отправлено"].map((st) => (
                        <button key={st} onClick={() => onStatusChange(st)} style={{
                          flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid", fontSize: "12px", cursor: "pointer",
                          borderColor: STATUS_DB_MAP[details.status] === st ? STATUS_STYLES[st].color : "#e2e8f0",
                          background: STATUS_DB_MAP[details.status] === st ? STATUS_STYLES[st].bg : "white",
                          color: STATUS_DB_MAP[details.status] === st ? STATUS_STYLES[st].color : "#64748b",
                          fontWeight: STATUS_DB_MAP[details.status] === st ? 600 : 400,
                        }}>
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                      <h4 style={{ margin: 0, fontSize: "16px" }}>Файлы ({details.files ? details.files.length : 0})</h4>
                      <label className="btn" style={{ padding: "5px 10px", fontSize: "12px", cursor: "pointer" }}>
                        <Upload size={14} style={{ marginRight: "5px" }} /> Загрузить
                        <input type="file" hidden onChange={onFileUpload} />
                      </label>
                    </div>
                    {details.files && details.files.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {details.files.map((file, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", padding: "10px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f9fafb" }}>
                            <div style={{ background: "white", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0", marginRight: "10px" }}>
                              <FileText size={20} color="#3b82f6" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                              <div style={{ fontSize: "11px", color: "#94a3b8" }}>{new Date(file.modified * 1000).toLocaleDateString()}</div>
                            </div>
                            <button onClick={() => onFileDownload(file.name)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "5px" }}>
                              <Download size={16} />
                            </button>
                            <button onClick={() => onFileDelete(file.name)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "5px" }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "30px", border: "2px dashed #e2e8f0", borderRadius: "8px", color: "#94a3b8", fontSize: "13px" }}>
                        Нет загруженных файлов
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: "20px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", gap: "10px" }}>
              <button onClick={() => { window.location.href = `mailto:${details?.email}`; }} className="btn" style={{ flex: 1, background: "#3b82f6", justifyContent: "center" }} disabled={!details?.email}>
                <Mail size={18} style={{ marginRight: "8px" }} /> Написать
              </button>
              <button onClick={onDeleteClient} className="btn" style={{ background: "#fee2e2", color: "#ef4444", border: "1px solid #fecaca" }}>
                <Trash2 size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default ClientDrawer;
