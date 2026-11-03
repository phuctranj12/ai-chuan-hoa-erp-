# Nginx: TLS + reverse proxy sang service `mcp`. Cấu hình nung vào image để rollback theo tag
# là quay lui cả code lẫn cấu hình proxy. Entrypoint của nginx chạy envsubst trên *.template lúc khởi động,
# nên SERVER_DOMAIN / TRUSTED_PROXY_IP đọc từ .env mà không phải build lại.
FROM nginx:1.27-alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security_headers.conf /etc/nginx/security_headers.conf
EXPOSE 443
