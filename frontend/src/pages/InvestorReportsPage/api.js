import { api } from "../../api";

export const listUploads = () => api.get("/investor-reports");

export const getUpload = (id) => api.get(`/investor-reports/${id}`);

export const deleteUpload = (id) => api.delete(`/investor-reports/${id}`);

export const preview = (file, mode = "consolidated", formula = "B") => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  fd.append("formula", formula);
  return api.post("/investor-reports/preview", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const generate = (payload) =>
  api.post("/investor-reports/generate", payload);

export const downloadFileUrl = (uploadId, fileId) =>
  `/api/v1/investor-reports/${uploadId}/download/${fileId}`;

export const downloadZipUrl = (uploadId) =>
  `/api/v1/investor-reports/${uploadId}/download-zip`;

export const downloadSourceUrl = (uploadId) =>
  `/api/v1/investor-reports/${uploadId}/source`;

export const templateUrl = (mode = "consolidated") =>
  `/api/v1/investor-reports/template?mode=${encodeURIComponent(mode)}`;
