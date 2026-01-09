# syntax=docker/dockerfile:1.6

# Этап 1: Сборка (Build) - всегда на BUILDPLATFORM, чтобы не падало под qemu arm64
ARG BUILDPLATFORM
FROM --platform=$BUILDPLATFORM node:20-alpine as build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Этап 2: Запуск (Serve via Nginx) - под TARGETPLATFORM автоматически
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
