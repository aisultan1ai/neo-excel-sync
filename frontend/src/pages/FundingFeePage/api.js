import { api } from "../../api";

// ─── accounts ────────────────────────────────────────────────────────────────

export const getAccounts = () => api.get("/ff/accounts");

export const createAccount = (data) => api.post("/ff/accounts", data);

export const deleteAccount = (id) => api.delete(`/ff/accounts/${id}`);

export const getSymbols = (id) => api.get(`/ff/accounts/${id}/symbols`);

// ─── records ─────────────────────────────────────────────────────────────────

export const loadStream = (payload, signal) =>
  fetch("/api/v1/ff/load-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
    signal,
  });

export const getSummary = (params) => api.get("/ff/summary", { params });

export const getRecords = (params) => api.get("/ff/records", { params });

export const exportExcel = (queryString) =>
  api.get(`/ff/export?${queryString}`, { responseType: "blob" });

export const deleteRecords = (queryString) => api.delete(`/ff/records?${queryString}`);

// ─── unity config ─────────────────────────────────────────────────────────────

export const getUnityConfig = () => api.get("/ff/unity-config");

export const saveUnityConfig = (data) => api.put("/ff/unity-config", data);

// ─── mappings ────────────────────────────────────────────────────────────────

export const getAllMappings = () => api.get("/ff/cashout-mappings");

export const getMapping = (id) => api.get(`/ff/cashout-mapping/${id}`);

export const saveMapping = (id, data) => api.put(`/ff/cashout-mapping/${id}`, data);

// ─── cashout / cashin ─────────────────────────────────────────────────────────

export const sendCashout = (data) => api.post("/ff/cashout", data);

export const getHistory = (params) => api.get("/ff/cashout/history", { params });

// ─── schedules ───────────────────────────────────────────────────────────────

export const getSchedules = () => api.get("/ff/cashout/schedules");

export const saveSchedule = (id, data) => api.put(`/ff/cashout/schedules/${id}`, data);

export const deleteSchedule = (id) => api.delete(`/ff/cashout/schedules/${id}`);
