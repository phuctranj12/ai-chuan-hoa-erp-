#!/usr/bin/env bash
# Kiểm tra server đủ điều kiện trước khi deploy. Thiếu gì thì dừng NGAY, chưa đụng tới stack đang chạy.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "PREFLIGHT LỖI: $*" >&2; exit 1; }

[ -f .env ] || fail "thiếu deploy/.env (chép từ .env.example rồi điền)"
set -a; . ./.env; set +a

[ -n "${SERVER_DOMAIN:-}" ] || fail "SERVER_DOMAIN trống"
case "$SERVER_DOMAIN" in *://*|*/*|*:*) fail "SERVER_DOMAIN chỉ là tên miền, không có https:// hay cổng";; esac
[ -n "${PUBLIC_HTTPS_PORT:-}" ] || fail "PUBLIC_HTTPS_PORT trống"
[[ "$PUBLIC_HTTPS_PORT" =~ ^[0-9]+$ ]] || fail "PUBLIC_HTTPS_PORT phải là số"
[ -n "${TRUSTED_PROXY_IP:-}" ] || fail "TRUSTED_PROXY_IP trống"
[ -n "${VT_ENC_KEY:-}" ] || fail "VT_ENC_KEY trống (openssl rand -base64 32)"
[ "$(printf '%s' "$VT_ENC_KEY" | base64 -d 2>/dev/null | wc -c)" -eq 32 ] || fail "VT_ENC_KEY phải giải mã base64 ra đúng 32 byte"

[ -s certs/server.crt ] || fail "thiếu certs/server.crt (fullchain do IT cấp)"
[ -s certs/server.key ] || fail "thiếu certs/server.key"
if command -v openssl >/dev/null; then
  openssl x509 -in certs/server.crt -noout -checkend 604800 >/dev/null || echo "CẢNH BÁO: chứng chỉ hết hạn trong vòng 7 ngày" >&2
  crt=$(openssl x509 -in certs/server.crt -noout -pubkey | openssl sha256)
  key=$(openssl pkey -in certs/server.key -pubout | openssl sha256)
  [ "$crt" = "$key" ] || fail "certs/server.key không khớp certs/server.crt"
fi

# Cổng đã bị stack KHÁC chiếm thì compose sẽ lỗi giữa chừng — báo sớm.
holder=$(docker ps --filter "publish=$PUBLIC_HTTPS_PORT" --format '{{.Names}}' | grep -v '^vattu-mcp-' || true)
[ -z "$holder" ] || fail "cổng $PUBLIC_HTTPS_PORT đang thuộc container khác: $holder"

docker compose config -q || fail "docker compose config lỗi"
echo "Preflight OK: https://$SERVER_DOMAIN (host port $PUBLIC_HTTPS_PORT)"
