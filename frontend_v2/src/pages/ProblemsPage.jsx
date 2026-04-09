import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  Shield,
  CalendarDays,
  FileText,
} from "lucide-react";
import { toast } from "react-toastify";

import { api } from "../api/client";

function ProblemModal({ open, title, form, setForm, onClose, onSave, saving }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="card problems-modal-card">
        <div className="problems-modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="problems-modal-body">
          <div className="form-group">
            <label>Название</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Например: Дубликаты в trade выгрузке"
            />
          </div>

          <div className="form-group">
            <label>Описание</label>
            <textarea
              rows={7}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Подробное описание проблемы..."
            />
          </div>
        </div>

        <div className="problems-modal-footer">
          <button className="secondary-btn" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="save-btn" onClick={onSave} type="button" disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function ProblemsPage() {
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
  });

  const isAdmin = !!profile?.is_admin;

  async function loadProfile() {
    try {
      const res = await api.get("/api/v2/profile");
      setProfile(res.data);
    } catch (e) {
      console.error(e);
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function loadProblems() {
    try {
      setLoading(true);
      const res = await api.get("/api/v2/problems?limit=200");
      const rows = Array.isArray(res.data) ? res.data : [];
      setProblems(rows);

      if (!selectedId && rows.length > 0) {
        setSelectedId(rows[0].id);
      } else if (selectedId && !rows.some((p) => p.id === selectedId)) {
        setSelectedId(rows[0]?.id || null);
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Ошибка загрузки проблем");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    loadProblems();
  }, []);

  const filteredProblems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return problems;

    return problems.filter((p) => {
      const title = String(p.title || "").toLowerCase();
      const desc = String(p.description || "").toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [problems, search]);

  const selectedProblem =
    filteredProblems.find((p) => p.id === selectedId) ||
    problems.find((p) => p.id === selectedId) ||
    null;

  function openCreateModal() {
    setForm({ title: "", description: "" });
    setShowCreate(true);
  }

  function openEditModal() {
    if (!selectedProblem) return;
    setForm({
      title: selectedProblem.title || "",
      description: selectedProblem.description || "",
    });
    setShowEdit(true);
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      toast.warning("Введите название");
      return;
    }

    try {
      setSaving(true);
      const res = await api.post("/api/v2/problems", {
        title: form.title.trim(),
        description: form.description.trim(),
      });

      const created = res.data?.problem;
      toast.success("Проблема создана");
      setShowCreate(false);
      await loadProblems();
      if (created?.id) setSelectedId(created.id);
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Ошибка создания");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selectedProblem) return;
    if (!form.title.trim()) {
      toast.warning("Введите название");
      return;
    }

    try {
      setSaving(true);
      await api.put(`/api/v2/problems/${selectedProblem.id}`, {
        title: form.title.trim(),
        description: form.description.trim(),
      });

      toast.success("Проблема обновлена");
      setShowEdit(false);
      await loadProblems();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Ошибка обновления");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedProblem) return;
    if (!window.confirm("Удалить эту проблему?")) return;

    try {
      await api.delete(`/api/v2/problems/${selectedProblem.id}`);
      toast.success("Проблема удалена");
      await loadProblems();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Ошибка удаления");
    }
  }

  if (loadingProfile) {
    return (
      <div className="page">
        <div className="card">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="page problems-page">
      <ProblemModal
        open={showCreate}
        title="Новая проблема"
        form={form}
        setForm={setForm}
        onClose={() => setShowCreate(false)}
        onSave={handleCreate}
        saving={saving}
      />

      <ProblemModal
        open={showEdit}
        title="Редактировать проблему"
        form={form}
        setForm={setForm}
        onClose={() => setShowEdit(false)}
        onSave={handleUpdate}
        saving={saving}
      />

      <div className="problems-head">
        <div>
          <h1>Проблемы</h1>
          <p>Реестр системных и операционных проблем платформы</p>
        </div>

        <div className="problems-head-actions">
          <button className="secondary-btn" onClick={loadProblems} type="button">
            <RefreshCw size={16} />
            <span>Обновить</span>
          </button>

          {isAdmin && (
            <button className="save-btn" onClick={openCreateModal} type="button">
              <Plus size={16} />
              <span>Добавить</span>
            </button>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="problems-readonly-banner">
          <Shield size={16} />
          <span>Режим просмотра. Создание и редактирование доступны только admin.</span>
        </div>
      )}

      <div className="problems-shell">
        <div className="card problems-list-card">
          <div className="problems-search-box">
            <Search size={16} color="#94a3b8" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по проблемам..."
            />
          </div>

          <div className="problems-list-meta">
            Найдено: {filteredProblems.length}
          </div>

          <div className="problems-list">
            {loading ? (
              <div className="problems-empty">Загрузка...</div>
            ) : filteredProblems.length === 0 ? (
              <div className="problems-empty">Проблемы не найдены</div>
            ) : (
              filteredProblems.map((problem) => (
                <button
                  key={problem.id}
                  className={`problems-list-item ${selectedId === problem.id ? "active" : ""}`}
                  onClick={() => setSelectedId(problem.id)}
                  type="button"
                >
                  <div className="problems-list-item-top">
                    <AlertTriangle size={16} color={selectedId === problem.id ? "#2563eb" : "#f59e0b"} />
                    <span className="problems-list-id">#{problem.id}</span>
                  </div>

                  <div className="problems-list-title">{problem.title || "Без названия"}</div>

                  <div className="problems-list-desc">
                    {problem.description ? String(problem.description).slice(0, 110) : "Без описания"}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card problems-detail-card">
          {!selectedProblem ? (
            <div className="problems-empty-detail">
              <FileText size={40} />
              <div>Выберите проблему слева</div>
            </div>
          ) : (
            <>
              <div className="problems-detail-head">
                <div className="problems-detail-title-wrap">
                  <div className="problems-problem-id">Проблема #{selectedProblem.id}</div>
                  <h2>{selectedProblem.title || "Без названия"}</h2>
                </div>

                {isAdmin && (
                  <div className="problems-detail-actions">
                    <button className="secondary-btn" onClick={openEditModal} type="button">
                      <Pencil size={16} />
                      <span>Редактировать</span>
                    </button>

                    <button className="secondary-btn danger" onClick={handleDelete} type="button">
                      <Trash2 size={16} />
                      <span>Удалить</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="problems-detail-meta">
                <div className="problems-meta-chip">
                  <CalendarDays size={14} />
                  <span>Создано: {formatDate(selectedProblem.created_at)}</span>
                </div>

                {"updated_at" in selectedProblem && (
                  <div className="problems-meta-chip">
                    <RefreshCw size={14} />
                    <span>Обновлено: {formatDate(selectedProblem.updated_at)}</span>
                  </div>
                )}

                {"created_by_user_id" in selectedProblem && selectedProblem.created_by_user_id && (
                  <div className="problems-meta-chip">
                    <Shield size={14} />
                    <span>Автор ID: {selectedProblem.created_by_user_id}</span>
                  </div>
                )}
              </div>

              <div className="problems-detail-body">
                <div className="problems-section-title">Описание</div>

                <div className="problems-description-box">
                  {selectedProblem.description ? (
                    <pre>{selectedProblem.description}</pre>
                  ) : (
                    <span className="problems-no-description">Описание не заполнено</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}