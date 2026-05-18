import axios from "axios";
import { getLocalYMD, parsePodftToday } from "./helpers";

export const checkSystemHealth = async () => {
  try {
    const res = await axios.get("/api/v1/health", { timeout: 2000 });
    return res.data;
  } catch {
    return { api: "Offline", db: "Disconnected" };
  }
};

export const fetchProblems = async () => {
  const res = await axios.get("/api/v1/problems");
  return Array.isArray(res.data) ? res.data : [];
};

export const fetchPodftToday = async () => {
  const day = getLocalYMD();
  const res = await axios.get(`/api/v1/podft/today?date=${encodeURIComponent(day)}`);
  return parsePodftToday(res.data);
};

export const fetchPodftTrades = async (dateStr) => {
  const day = dateStr || getLocalYMD();
  const res = await axios.get(`/api/v1/podft/trades?date=${encodeURIComponent(day)}`);
  const list = Array.isArray(res.data) ? res.data : res.data?.trades;
  return Array.isArray(list) ? list : [];
};

export const fetchDashboard = async () => {
  const resProfile = await axios.get("/api/v1/profile");
  const username = resProfile.data?.username || "User";
  const isAdmin =
    resProfile.data?.is_admin === true ||
    String(resProfile.data?.role || "").toLowerCase() === "admin";

  const res = await axios.get("/api/v1/dashboard");
  return { stats: res.data, username, isAdmin: Boolean(isAdmin) };
};

export const saveProblemApi = async (mode, id, title, description) => {
  if (mode === "create") {
    await axios.post("/api/v1/problems", { title, description });
  } else if (mode === "edit" && id != null) {
    await axios.put(`/api/v1/problems/${id}`, { title, description });
  }
};

export const deleteProblemApi = async (id) => {
  await axios.delete(`/api/v1/problems/${id}`);
};
