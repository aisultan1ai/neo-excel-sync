import { api } from "../../api";

const clean = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "" && v != null));

export const listTx            = (f) => api.get("/crypto-tx", { params: clean(f) });
export const createTx          = (row) => api.post("/crypto-tx", row);
export const updateTx          = (id, row) => api.put(`/crypto-tx/${id}`, row);
export const deleteTx          = (id) => api.delete(`/crypto-tx/${id}`);
export const getCounterparties = () => api.get("/crypto-tx/counterparties");
export const exportTx          = (f) => api.get("/crypto-tx/export", { params: clean(f), responseType: "blob" });

export const importTx = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/crypto-tx/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
};

export const listSections   = () => api.get("/crypto-tx/sections");
export const createSection  = (s) => api.post("/crypto-tx/sections", s);
export const updateSection  = (id, patch) => api.patch(`/crypto-tx/sections/${id}`, patch);
export const deleteSection  = (id, moveTo) => api.delete(`/crypto-tx/sections/${id}`, { params: clean({ move_to: moveTo }) });
