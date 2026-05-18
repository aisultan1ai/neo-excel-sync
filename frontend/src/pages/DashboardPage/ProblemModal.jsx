import React, { useState, useEffect } from "react";
import { Edit2, Trash2, X, Save } from "lucide-react";

const ProblemModal = ({ open, mode, problem, isAdmin, onClose, onSaved, onEditMode }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(problem?.title || "");
      setDescription(problem?.description || "");
      setSaving(false);
    }
  }, [open, problem]);

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString();
  };

  if (!open) return null;

  const bodyStyle = { padding: "16px" };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", outline: "none", fontSize: 13, color: "#0f172a" };
  const labelStyle = { fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: 6 };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "18px" }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(560px, 95vw)", background: "white", borderRadius: "16px", boxShadow: "0 25px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>
            {mode === "create" ? "Новая проблема" : mode === "edit" ? "Редактирование" : "Описание проблемы"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isAdmin && mode === "view" && problem && (
              <button type="button" onClick={() => onEditMode(problem)} className="btn" style={{ background: "white", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "8px 10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Edit2 size={16} /> Edit
              </button>
            )}
            <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
              <X size={20} color="#334155" />
            </button>
          </div>
        </div>

        <div style={bodyStyle}>
          {mode === "view" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", lineHeight: 1.25 }}>{problem?.title}</div>
              {problem?.created_at && <div style={{ fontSize: 12, color: "#94a3b8" }}>{formatDate(problem.created_at)}</div>}
              <div style={{ marginTop: "6px", padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 13 }}>
                {problem?.description || "Описание не указано."}
              </div>
              {isAdmin && problem && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                  <button type="button" onClick={() => onSaved("delete", problem)} className="btn" style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
                    <Trash2 size={16} /> Удалить
                  </button>
                </div>
              )}
            </div>
          )}

          {(mode === "create" || mode === "edit") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {!isAdmin ? (
                <div style={{ color: "#991b1b", background: "#fef2f2", padding: 12, borderRadius: 12, fontSize: 13 }}>
                  У вас нет прав для изменения проблем.
                </div>
              ) : (
                <>
                  <div>
                    <div style={labelStyle}>Название</div>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Ошибка импорта сверки" style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>Описание</div>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Подробности проблемы..." rows={6} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.45 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: 4 }}>
                    <button type="button" onClick={onClose} className="btn" style={{ background: "white", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", fontWeight: 600 }} disabled={saving}>
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!title.trim()) return;
                        setSaving(true);
                        await onSaved(mode, { id: problem?.id, title: title.trim(), description: description.trim() });
                        setSaving(false);
                      }}
                      className="btn"
                      style={{ borderRadius: "10px", padding: "10px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px", opacity: saving ? 0.7 : 1, fontWeight: 600 }}
                      disabled={saving || !title.trim()}
                    >
                      <Save size={16} /> {saving ? "Сохранение..." : "Сохранить"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProblemModal;
