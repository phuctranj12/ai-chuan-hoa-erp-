#!/usr/bin/env bash
# Quay lui về một bản đã build trước đó (vài giây, KHÔNG build lại).
#   ./rollback.sh            -> liệt kê tag có thể quay về
#   ./rollback.sh a1b2c3d    -> quay về tag đó
# Rollback chỉ đổi code. Volume vattu_data (phiên, audit) giữ nguyên — schema chỉ thêm, không xoá cột.
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "Dùng: ./rollback.sh <tag>"
  ./list-releases.sh
  exit 1
fi

# Image PHẢI có sẵn. Thiếu guard này, `up` sẽ build code HIỆN TẠI rồi gắn nhãn tag cũ → tưởng đã rollback.
for repo in vattu_mcp vattu_gateway; do
  docker image inspect "$repo:$TAG" >/dev/null 2>&1 || { echo "LỖI: không có image $repo:$TAG (chỉ giữ 5 bản gần nhất)"; exit 1; }
done

./scripts/write-override.sh "$TAG"
docker compose up -d --no-build
mkdir -p shared
printf '%s  %s  ROLLBACK\n' "$(date -Iseconds)" "$TAG" >> shared/releases.log
echo "$TAG" > shared/CURRENT_TAG
docker compose ps
./scripts/health-check.sh
