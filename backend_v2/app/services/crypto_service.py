from __future__ import annotations

from app.repositories.crypto import (
    get_crypto_accounts,
    create_crypto_account,
    update_crypto_account,
    delete_crypto_account,
    crypto_account_exists,
    get_crypto_transfers,
    create_crypto_transfer,
    delete_crypto_transfer,
    get_crypto_schemes,
    create_crypto_scheme,
    delete_crypto_scheme,
)


def list_accounts():
    return get_crypto_accounts()


def add_account(provider: str, name: str, asset: str | None = None):
    return create_crypto_account(provider=provider, name=name, asset=asset)


def edit_account(account_id: int, provider: str, name: str, asset: str | None = None):
    return update_crypto_account(account_id=account_id, provider=provider, name=name, asset=asset)


def remove_account(account_id: int) -> bool:
    return delete_crypto_account(account_id)


def list_transfers():
    return get_crypto_transfers()


def add_transfer(
    date,
    type_: str,
    from_account_id,
    to_account_id,
    amount,
    asset: str,
    comment: str = "",
    label: str = "",
):
    if from_account_id is not None and not crypto_account_exists(from_account_id):
        raise ValueError("from_account_id not found")

    if to_account_id is not None and not crypto_account_exists(to_account_id):
        raise ValueError("to_account_id not found")

    if type_ not in {"transfer", "deposit", "withdraw"}:
        raise ValueError("type must be transfer, deposit or withdraw")

    return create_crypto_transfer(
        date=date,
        type_=type_,
        from_id=from_account_id,
        to_id=to_account_id,
        amount=amount,
        asset=asset,
        comment=comment,
        label=label,
    )


def remove_transfer(transfer_id: int) -> bool:
    return delete_crypto_transfer(transfer_id)


def list_schemes():
    return get_crypto_schemes()


def add_scheme(name: str, nodes, edges):
    return create_crypto_scheme(name=name, nodes=nodes, edges=edges)


def remove_scheme(scheme_id: int) -> bool:
    return delete_crypto_scheme(scheme_id)