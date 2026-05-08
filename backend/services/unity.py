import logging

import requests

log = logging.getLogger(__name__)


def _call(
    endpoint: str,
    base_url: str,
    auth_token: str,
    account_id: int,
    asset_id: int,
    amount: float,
    netting_date: str,
    real_account_id: int,
    comment: str = "",
    internal_comment: str = "",
) -> dict:
    url = f"{base_url.rstrip('/')}{endpoint}"
    payload = {
        "accountId": account_id,
        "assetId": asset_id,
        "amount": amount,
        "nettingDate": netting_date,
        "comment": comment,
        "internalComment": internal_comment,
        "realAccountId": real_account_id,
    }
    resp = requests.post(
        url,
        json=payload,
        headers={"auth-token": auth_token, "Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def send_cashin(
    base_url: str, auth_token: str, account_id: int, asset_id: int,
    amount: float, netting_date: str, real_account_id: int,
    comment: str = "", internal_comment: str = "",
) -> dict:
    return _call("/api/v1/cashIn", base_url, auth_token, account_id, asset_id,
                 amount, netting_date, real_account_id, comment, internal_comment)


def send_cashout(
    base_url: str, auth_token: str, account_id: int, asset_id: int,
    amount: float, netting_date: str, real_account_id: int,
    comment: str = "", internal_comment: str = "",
) -> dict:
    return _call("/api/v1/cashOut", base_url, auth_token, account_id, asset_id,
                 amount, netting_date, real_account_id, comment, internal_comment)
