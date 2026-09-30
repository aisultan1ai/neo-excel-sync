import { api } from "../../api";

export const listAccounts  = ()           => api.get("/positions/accounts");
export const addAccounts   = (accountIds) => api.post("/positions/accounts", { account_ids: accountIds });
export const deleteAccount = (id)         => api.delete(`/positions/accounts/${id}`);

export const reconcilePositions = (accountIds, fromDate, toDate) =>
  api.post("/positions/reconcile", {
    account_ids: accountIds,
    from_date: fromDate || null,
    to_date: toDate || null,
  });
