#!/usr/bin/env bash
# Ortho Diamond dev start (Linux/macOS/Git Bash).  ./scripts/dev.sh [--ngrok]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if command -v docker >/dev/null 2>&1; then
  docker compose -f "$ROOT/docker-compose.yml" up -d postgres redis ollama
else
  echo "Docker not installed: expecting a local PostgreSQL on :5432"
fi

(cd "$ROOT/FE/admin" && npm run build)

(cd "$ROOT/BE" && npx prisma migrate deploy && npm run dev) &
(cd "$ROOT/FE/web" && npm run dev -- -p 3100) &
node "$ROOT/scripts/gateway.mjs" &

if [[ "${1:-}" == "--ngrok" ]]; then
  DOMAIN="$(grep '^NGROK_DOMAIN=' "$ROOT/BE/.env" | cut -d= -f2)"
  [[ -n "$DOMAIN" ]] || { echo "Set NGROK_DOMAIN in BE/.env"; exit 1; }
  ngrok http --url="$DOMAIN" 8100 &
fi

trap 'kill 0' INT TERM
wait
