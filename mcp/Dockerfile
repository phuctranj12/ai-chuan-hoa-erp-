# MCP "AI Chuẩn hóa vật tư ERP". Build context = GỐC repo (cần cả plugin/ lẫn mcp/):
#   docker build -f mcp/Dockerfile -t vattu_mcp:dev .
# Node 24 chạy thẳng .ts (type stripping) → không có bước build, image chỉ chứa mã nguồn + lõi plugin.
FROM node:24-alpine AS deps
WORKDIR /app
COPY mcp/package.json mcp/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-alpine
ENV NODE_ENV=production \
    VT_PORT=8080 \
    VT_DATA_DIR=/data \
    VT_SKILL_DIR=/app/plugin/skills/ai-chuan-hoa-vat-tu-erp
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY mcp/package.json ./
COPY mcp/src ./src
# Lõi chuẩn hoá + dữ liệu đóng gói lấy NGUYÊN từ plugin (nguồn sự thật duy nhất). Chỉ chép phần lõi dùng.
COPY plugin/plugin.json ./plugin/plugin.json
COPY plugin/skills/ai-chuan-hoa-vat-tu-erp/scripts ./plugin/skills/ai-chuan-hoa-vat-tu-erp/scripts
COPY plugin/skills/ai-chuan-hoa-vat-tu-erp/references ./plugin/skills/ai-chuan-hoa-vat-tu-erp/references
COPY plugin/skills/ai-chuan-hoa-vat-tu-erp/assets/catalogs.json \
     plugin/skills/ai-chuan-hoa-vat-tu-erp/assets/training.json \
     plugin/skills/ai-chuan-hoa-vat-tu-erp/assets/b3-srh-alias.json \
     plugin/skills/ai-chuan-hoa-vat-tu-erp/assets/chuan-hoa-2-alias.json \
     plugin/skills/ai-chuan-hoa-vat-tu-erp/assets/data-provenance.json \
     ./plugin/skills/ai-chuan-hoa-vat-tu-erp/assets/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
