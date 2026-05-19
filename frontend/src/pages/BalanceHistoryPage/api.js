import { api } from "../../api";

export const listAccounts  = ()          => api.get("/bh/accounts");
export const createAccount = (data)      => api.post("/bh/accounts", data);
export const deleteAccount = (id)        => api.delete(`/bh/accounts/${id}`);

export const fetchData     = (from, to)  => api.get("/bh/data",   { params: { from, to } });
export const exportExcel   = (from, to)  => api.get("/bh/export", { params: { from, to }, responseType: "blob" });

export const getUnityConfig  = ()       => api.get("/ff/unity-config");
export const saveUnityConfig = (data)   => api.put("/ff/unity-config", data);
