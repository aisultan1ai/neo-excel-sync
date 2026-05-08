.PHONY: up down restart status logs logs-back logs-front \
        build build-push backup restore shell-db shell-back help

## ─── DOCKER ───────────────────────────────────────────────────────────────

up:
	docker-compose up -d

down:
	docker-compose down

restart:
	docker-compose restart

status:
	docker-compose ps

## ─── ЛОГИ ─────────────────────────────────────────────────────────────────

logs:
	docker-compose logs -f

logs-back:
	docker-compose logs -f backend

logs-front:
	docker-compose logs -f frontend

## ─── СБОРКА И ПУБЛИКАЦИЯ ──────────────────────────────────────────────────

build:
	docker-compose -f docker-compose.build.yml build

build-push:
	docker-compose -f docker-compose.build.yml build
	docker-compose -f docker-compose.build.yml push

## ─── БАЗА ДАННЫХ ──────────────────────────────────────────────────────────

backup:
	@bash scripts/backup-db.sh

restore:
	@bash scripts/restore-db.sh $(FILE)

shell-db:
	docker exec -it neo_db sh -c 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

## ─── ОТЛАДКА ──────────────────────────────────────────────────────────────

shell-back:
	docker exec -it neo_backend bash

## ─── ПОМОЩЬ ───────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "NeoExcelSync — доступные команды:"
	@echo ""
	@echo "  make up                              Запустить все сервисы"
	@echo "  make down                            Остановить все сервисы"
	@echo "  make restart                         Перезапустить все сервисы"
	@echo "  make status                          Статус контейнеров"
	@echo "  make logs                            Логи всех сервисов (follow)"
	@echo "  make logs-back                       Логи только backend"
	@echo "  make logs-front                      Логи только frontend"
	@echo "  make build                           Собрать образы локально"
	@echo "  make build-push                      Собрать и запушить образы в Docker Hub"
	@echo "  make backup                          Создать бэкап БД → backups/"
	@echo "  make restore FILE=backups/file.sql.gz  Восстановить БД из файла"
	@echo "  make shell-db                        Открыть psql в контейнере БД"
	@echo "  make shell-back                      Открыть bash в контейнере backend"
	@echo ""
