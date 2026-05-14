import logging
from datetime import date, timedelta

from core.constants import TransactionType, TriggeredBy
from db import funding as funding_db
from db import cashout as cashout_db
from services.encryption import decrypt_value
from services import unity as unity_service

log = logging.getLogger(__name__)


def run_scheduled_cashouts():
    today = date.today()
    schedules = cashout_db.get_cashout_schedules()
    if not schedules:
        return

    for sched in schedules:
        if not sched["enabled"]:
            continue
        last_run = sched.get("last_run_date")
        if last_run and str(last_run)[:10] == str(today):
            continue

        if sched["frequency"] == "monthly":
            should_run = today.day == sched["day_of_period"]
        else:
            should_run = today.isoweekday() == sched["day_of_period"]
        if not should_run:
            continue

        if sched["frequency"] == "monthly":
            if today.month == 1:
                start = date(today.year - 1, 12, 1)
            else:
                start = date(today.year, today.month - 1, 1)
            end = date(today.year, today.month, 1) - timedelta(days=1)
        else:
            end = today - timedelta(days=1)
            start = end - timedelta(days=6)

        start_str = start.strftime("%Y-%m-%d")
        end_str = end.strftime("%Y-%m-%d")
        summary = funding_db.get_ff_summary(sched["ff_account_id"], start_str, end_str)
        amount = summary.get("grand_total", 0.0)
        if amount == 0.0:
            log.info("Schedule account=%d: amount is 0, skip", sched["ff_account_id"])
            continue

        mapping = cashout_db.get_cashout_mapping(sched["ff_account_id"])
        if not mapping:
            log.warning("Schedule account=%d: no Unity mapping, skip", sched["ff_account_id"])
            continue

        account = funding_db.get_ff_account_by_id(sched["ff_account_id"])
        owner_id = account["owner_id"] if account else None
        owner_config = cashout_db.get_unity_config(owner_id) if owner_id else {}
        if not owner_config.get("base_url") or not owner_config.get("auth_token_enc"):
            log.warning("Schedule account=%d: owner has no Unity config, skip", sched["ff_account_id"])
            continue
        try:
            sched_auth_token = decrypt_value(owner_config["auth_token_enc"])
        except Exception:
            log.warning("Schedule account=%d: token decryption failed, skip", sched["ff_account_id"])
            continue

        is_cashin = amount > 0
        tx_type = TransactionType.CASHIN if is_cashin else TransactionType.CASHOUT
        caller = unity_service.send_cashin if is_cashin else unity_service.send_cashout

        acc_name = account.get("name", str(sched["ff_account_id"])) if account else str(sched["ff_account_id"])
        auto_comment = f"Funding fee_{acc_name}_{start_str}_{end_str}_neoapi"

        try:
            result = caller(
                base_url=owner_config["base_url"],
                auth_token=sched_auth_token,
                account_id=mapping["unity_account_id"],
                asset_id=mapping["unity_asset_id"],
                amount=round(abs(amount), 6),
                netting_date=str(today),
                real_account_id=mapping["unity_real_account_id"],
                comment=auto_comment,
                internal_comment=f"Schedule {sched['frequency']} account={sched['ff_account_id']}",
            )
            tx_id = str(result.get("transactionId", result) if isinstance(result, dict) else result)
            cashout_db.save_cashout_record(
                ff_account_id=sched["ff_account_id"],
                amount=amount,
                netting_date=str(today),
                start_date=start_str,
                end_date=end_str,
                transaction_id=tx_id,
                status="success",
                comment=auto_comment,
                internal_comment=f"Schedule {sched['frequency']}",
                error_message=None,
                triggered_by=TriggeredBy.SCHEDULE.value,
                created_by_user_id=None,
                transaction_type=tx_type.value,
            )
            cashout_db.mark_schedule_run(sched["ff_account_id"], str(today))
            cashout_db.log_ff_action(owner_id, "schedule", "cashout_send", {
                "account_id": sched["ff_account_id"], "account_name": acc_name,
                "tx_type": tx_type.value, "amount": amount, "tx_id": tx_id,
                "period": f"{start_str} — {end_str}", "triggered_by": TriggeredBy.SCHEDULE.value,
            })
            log.info("Schedule %s done: account=%d txId=%s", tx_type.value, sched["ff_account_id"], tx_id)
        except Exception as e:
            log.error("Schedule cashout failed: account=%d: %s", sched["ff_account_id"], e, exc_info=True)
            cashout_db.save_cashout_record(
                ff_account_id=sched["ff_account_id"],
                amount=amount,
                netting_date=str(today),
                start_date=start_str,
                end_date=end_str,
                transaction_id=None,
                status="error",
                comment=auto_comment,
                internal_comment=None,
                error_message=str(e),
                triggered_by=TriggeredBy.SCHEDULE.value,
                created_by_user_id=None,
            )
