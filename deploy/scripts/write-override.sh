#!/usr/bin/env bash
# Sinh "con trỏ phiên bản" docker-compose.override.yml. Compose merge file này với docker-compose.yml:
#   docker compose up -d --build     -> build VÀ gắn tag này   (deploy)
#   docker compose up -d --no-build  -> dùng image có sẵn      (rollback, vài giây)
set -euo pipefail

TAG="${1:?Dùng: write-override.sh <tag>}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

cat > "$DIR/docker-compose.override.yml" <<EOF
# TỰ SINH bởi scripts/write-override.sh - ĐỪNG SỬA TAY.
# Phiên bản đang chạy: $TAG
services:
  mcp:
    image: vattu_mcp:$TAG
    environment:
      APP_VERSION: "$TAG"
  gateway:
    image: vattu_gateway:$TAG
EOF

echo "Đã ghi docker-compose.override.yml -> tag $TAG"
