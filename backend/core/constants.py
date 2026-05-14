from enum import Enum


class ExchangeType(str, Enum):
    BINANCE = "BINANCE"
    OKX = "OKX"
    BYBIT = "BYBIT"


class TransactionType(str, Enum):
    CASHOUT = "cashout"
    CASHIN = "cashin"


class TriggeredBy(str, Enum):
    MANUAL = "manual"
    SCHEDULE = "schedule"


class ScheduleFrequency(str, Enum):
    MONTHLY = "monthly"
    WEEKLY = "weekly"


VALID_EXCHANGE_TYPES = {e.value for e in ExchangeType}
