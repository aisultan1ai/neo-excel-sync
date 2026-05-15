import { api } from "../../api";

const unwrap = (resData) => {
  if (resData && typeof resData === "object" && "data" in resData) return resData.data;
  return resData;
};

export const fetchCryptoAccounts = async () => unwrap((await api.get("/crypto/accounts")).data);
export const createCryptoAccount = async (payload) =>
  unwrap((await api.post("/crypto/accounts", payload)).data);
export const updateCryptoAccount = async (id, payload) =>
  unwrap((await api.put(`/crypto/accounts/${id}`, payload)).data);
export const deleteCryptoAccount = async (id) =>
  unwrap((await api.delete(`/crypto/accounts/${id}`)).data);

export const fetchTransfers = async () => unwrap((await api.get("/crypto/transfers")).data);
export const createTransfer = async (payload) =>
  unwrap((await api.post("/crypto/transfers", payload)).data);
export const deleteTransferApi = async (id) =>
  unwrap((await api.delete(`/crypto/transfers/${id}`)).data);

export const fetchSchemes = async () => unwrap((await api.get("/crypto/schemes")).data);
export const createSchemeApi = async (payload) =>
  unwrap((await api.post("/crypto/schemes", payload)).data);
export const deleteSchemeApi = async (id) =>
  unwrap((await api.delete(`/crypto/schemes/${id}`)).data);
