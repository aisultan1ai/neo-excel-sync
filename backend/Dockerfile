# BackEnd/Dockerfile

# Используем легкий образ Python
FROM python:3.9-slim

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Сначала копируем зависимости (для кэширования слоев Docker)
COPY requirements.txt .

# Устанавливаем зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем остальной код
COPY . .

# Создаем папку для загрузок, если её нет (важно для вашего функционала)
RUN mkdir -p uploads withdrawals

# Команда для запуска сервера
# host 0.0.0.0 обязателен для Docker!
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]