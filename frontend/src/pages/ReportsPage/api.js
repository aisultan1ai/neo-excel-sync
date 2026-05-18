import axios from "axios";

export const fetchClients = async (searchTerm = "") => {
  const res = await axios.get(`/api/v1/clients?search=${searchTerm}`);
  return res.data;
};

export const fetchClientDetails = async (id) => {
  const res = await axios.get(`/api/v1/clients/${id}`);
  return res.data;
};

export const createClient = async (data) => {
  const formData = new FormData();
  Object.keys(data).forEach((k) => formData.append(k, data[k]));
  await axios.post("/api/v1/clients", formData);
};

export const updateClient = async (id, data) => {
  const formData = new FormData();
  Object.keys(data).forEach((k) => formData.append(k, data[k]));
  await axios.put(`/api/v1/clients/${id}`, formData);
};

export const updateClientStatus = async (id, dbStatus) => {
  await axios.put(`/api/v1/clients/${id}/status`, { status: dbStatus });
};

export const deleteClient = async (id) => {
  await axios.delete(`/api/v1/clients/${id}`);
};

export const uploadFile = async (clientId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  await axios.post(`/api/v1/clients/${clientId}/upload`, formData);
};

export const deleteFile = async (clientId, filename) => {
  await axios.delete(`/api/v1/clients/${clientId}/files/${filename}`);
};

export const downloadFile = async (clientId, filename) => {
  const res = await axios.get(`/api/v1/clients/${clientId}/files/${filename}`, {
    responseType: "blob",
  });
  return res.data;
};

export const resetAllStatuses = async () => {
  await axios.post("/api/v1/clients/reset-status", {});
};

export const checkPermission = async () => {
  const res = await axios.get("/api/v1/profile");
  return { department: res.data.department, isAdmin: res.data.is_admin };
};
