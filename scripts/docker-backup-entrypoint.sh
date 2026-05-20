#!/bin/sh
set -e

# Бекает переменные окружения Docker в скрипт, чтобы crond их видел
cat > /backup.sh << EOF
#!/bin/sh
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "/backups/neo_db_\$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
EOF

chmod +x /backup.sh
echo "0 3 * * * /backup.sh" > /etc/crontabs/root
exec crond -f -l 6
