# frontend/Dockerfile

# Этап 1: Сборка (Build)
FROM node:20-alpine as build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Этап 2: Запуск (Serve via Nginx)
FROM nginx:alpine
# Копируем собранные файлы из этапа 1 в папку Nginx
COPY --from=build /app/dist /usr/share/nginx/html
# Копируем наш конфиг Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]