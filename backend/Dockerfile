# ===== Base image =====
FROM python:3.9-slim

# Отключаем .pyc и буферизацию
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# ---- системные зависимости (минимум) ----
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gcc \
       libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# ---- Python deps ----
COPY requirements.txt .

RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

# ---- App code ----
COPY . .

RUN mkdir -p uploads withdrawals

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
