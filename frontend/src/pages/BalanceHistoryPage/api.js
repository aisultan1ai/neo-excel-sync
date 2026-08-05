import { api } from "../../api";

export const listAccounts  = ()          => api.get("/bh/accounts");
export const createAccount = (data)      => api.post("/bh/accounts", data);
export const deleteAccount = (id)        => api.delete(`/bh/accounts/${id}`);

export const fetchData     = (from, to, accountIds)  => api.get("/bh/data",   { params: { from, to, account_ids: accountIds }, paramsSerializer: { indexes: null } });
export const exportExcel   = (from, to, accountIds)  => api.get("/bh/export", { params: { from, to, account_ids: accountIds }, responseType: "blob", paramsSerializer: { indexes: null } });

export const getUnityConfig  = ()       => api.get("/ff/unity-config");
export const saveUnityConfig = (data)   => api.put("/ff/unity-config", data);
