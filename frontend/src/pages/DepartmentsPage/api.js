import axios from "axios";

export const fetchMe = async () => {
  const res = await axios.get("/api/v1/profile");
  return res.data;
};

export const fetchUsers = async () => {
  const res = await axios.get("/api/v1/users");
  return Array.isArray(res.data) ? res.data : [];
};

export const fetchDepartments = async () => {
  const res = await axios.get("/api/v1/departments");
  return res.data;
};

export const fetchTasks = async (activeDept) => {
  const url = activeDept === "My Tasks" ? "/api/v1/my-tasks" : `/api/v1/tasks/${activeDept}`;
  const res = await axios.get(url);
  return Array.isArray(res.data) ? res.data : [];
};

export const createTask = async (payload) => {
  const res = await axios.post("/api/v1/tasks", payload);
  return res.data;
};

export const uploadTaskAttachment = async (taskId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  await axios.post(`/api/v1/tasks/${taskId}/attachments`, formData);
};

export const fetchTaskComments = async (taskId) => {
  const res = await axios.get(`/api/v1/tasks/${taskId}/comments`);
  return Array.isArray(res.data) ? res.data : [];
};

export const fetchTaskAttachments = async (taskId) => {
  const res = await axios.get(`/api/v1/tasks/${taskId}/attachments`);
  return Array.isArray(res.data) ? res.data : [];
};

export const acceptTask = async (taskId) => {
  const res = await axios.post(`/api/v1/tasks/${taskId}/accept`, {});
  return res.data;
};

export const updateTaskStatus = async (taskId, status) => {
  await axios.put(`/api/v1/tasks/${taskId}/status`, { status });
};

export const updateTask = async (taskId, payload) => {
  await axios.put(`/api/v1/tasks/${taskId}`, payload);
};

export const deleteTask = async (taskId) => {
  await axios.delete(`/api/v1/tasks/${taskId}`);
};

export const postComment = async (taskId, content) => {
  await axios.post(`/api/v1/tasks/${taskId}/comments`, { content });
};

export const downloadAttachment = async (fileId) => {
  const res = await axios.get(`/api/v1/attachments/${fileId}`, { responseType: "blob" });
  return res.data;
};

export const deleteAttachment = async (fileId) => {
  await axios.delete(`/api/v1/attachments/${fileId}`);
};
