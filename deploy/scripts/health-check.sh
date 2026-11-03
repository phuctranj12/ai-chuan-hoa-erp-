#!/usr/bin/env bash
# Kiểm tra stack đang sống, đi đúng đường Claude/ChatGPT sẽ đi (qua nginx, đúng Host/SNI):
#   1) container mcp healthy  2) /mcp không token → 401  3) metadata resource = https://<domain>/mcp
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

URL="https://$SERVER_DOMAIN:$PUBLIC_HTTPS_PORT"
RESOLVE="$SERVER_DOMAIN:$PUBLIC_HTTPS_PORT:127.0.0.1"

for i in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' vattu-mcp-mcp-1 2>/dev/null || echo missing)
  [ "$status" = "healthy" ] && break
  sleep 3
done
[ "$status" = "healthy" ] || { echo "mcp không healthy ($status)"; docker compose logs --tail=80 mcp; exit 1; }
echo "  mcp healthy"

code=000
for i in $(seq 1 15); do
  # Chỉ lấy mã HTTP (3 ký tự cuối); mã thoát của curl không được làm bẩn kết quả.
  code=$(curl -sk --resolve "$RESOLVE" -o /dev/null -w '%{http_code}' -X POST "$URL/mcp" -H 'content-type: application/json' -d '{}' 2>/dev/null) || true
  code="${code: -3}"
  [ "$code" = "401" ] && break
  sleep 2
done
[ "$code" = "401" ] || { echo "/mcp qua nginx trả $code (mong đợi 401)"; docker compose logs --tail=80 gateway mcp; exit 1; }
echo "  /mcp qua nginx -> 401 (đúng: chưa có token)"

resource=$(curl -sk --resolve "$RESOLVE" "$URL/.well-known/oauth-protected-resource/mcp" | sed -n 's/.*"resource":"\([^"]*\)".*/\1/p')
[ "$resource" = "https://$SERVER_DOMAIN/mcp" ] || { echo "resource metadata sai: '$resource'"; exit 1; }
echo "  protected resource = $resource"
echo "HEALTH OK"
