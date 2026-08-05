FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Non-root пользователь
RUN useradd --create-home --uid 1000 bot

COPY --chown=bot:bot . .

# Каталог для persistent state (кэш инструментов, настройки пользователей).
# Права выставляем ДО USER, чтобы named volume при первом монтировании
# унаследовал ownership от bot (иначе бот, работающий под uid 1000, не сможет писать).
RUN mkdir -p /app/data && chown -R bot:bot /app/data

USER bot

ENTRYPOINT ["python", "bot.py"]
