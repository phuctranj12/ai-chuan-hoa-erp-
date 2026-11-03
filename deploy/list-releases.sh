#!/usr/bin/env bash
# Liệt kê các bản còn image trên server (quay về được) và lịch sử deploy/rollback.
set -euo pipefail
cd "$(dirname "$0")"
echo "Đang chạy: $(cat shared/CURRENT_TAG 2>/dev/null || echo '(chưa có)')"
echo ""
echo "Các bản còn image:"
docker images vattu_mcp --format '  {{.Tag}}\t(tạo {{.CreatedSince}})' | grep -v '<none>' || true
echo ""
echo "10 lần deploy/rollback gần nhất:"
tail -n 10 shared/releases.log 2>/dev/null || echo "  (chưa có lịch sử)"
