import { api } from "../../api";

const period = (from, to) => ({ params: { from, to } });

export const startSync    = (from, to) => api.post("/income/sync", { date_from: from, date_to: to });
export const getSync      = (runId)    => api.get(`/income/sync/${runId}`);
export const listRuns     = ()         => api.get("/income/runs");

export const getReport    = (from, to) => api.get("/income/report", period(from, to));
export const getDiagnostics = (from, to) => api.get("/income/diagnostics", period(from, to));
export const exportExcel  = (from, to) => api.get("/income/export", { ...period(from, to), responseType: "blob" });

export const listAccounts   = ()                    => api.get("/income/accounts");
export const updateAccounts = (accountIds, changes) => api.patch("/income/accounts", { account_ids: accountIds, changes });
export const addAccounts    = (accountIds)          => api.post("/income/accounts", { account_ids: accountIds });

export const getRates  = (month, from, to) => api.get("/income/rates", { params: { month, from, to } });
export const saveRates = (month, rates)    => api.put("/income/rates", { month, rates });

export const getSettings  = ()  => api.get("/income/settings");
export const saveSettings = (s) => api.put("/income/settings", s);
