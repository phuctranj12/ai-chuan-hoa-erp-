# Triển khai MCP "AI Chuẩn hóa vật tư ERP"

Stack: `mcp` (Node 24, cổng 8080 nội bộ) + `gateway` (nginx, TLS) — chạy bằng docker compose trên server,
cập nhật tự động qua GitHub Actions + runner self-hosted (cùng kiểu CATALOGUE / AI_HR).

```
Claude (cloud) / ChatGPT (cloud) / Claude Code
   → edge proxy công ty (cert *.hawee.com.vn, https://<SERVER_DOMAIN>)
   → server:<PUBLIC_HTTPS_PORT> → gateway (nginx) → mcp:8080
                                                     └→ cm-api.erp.hawee.com.vn (đăng nhập, quyền)
                                                     └→ bim.erp.hawee.com.vn   (danh mục vật tư)
```

## 0. Điều kiện

| Hạng mục | Yêu cầu |
|---|---|
| Domain | `SERVER_DOMAIN` trỏ qua edge proxy tới server, cổng `PUBLIC_HTTPS_PORT`. Claude/ChatGPT gọi **từ internet** → domain phải truy cập được từ ngoài. |
| Mạng ra | Server ra được `https://cm-api.erp.hawee.com.vn` và `https://bim.erp.hawee.com.vn`. |
| Chứng chỉ | `server.crt` (fullchain) + `server.key` cho `SERVER_DOMAIN` (wildcard `*.hawee.com.vn` của IT dùng được). |
| Phần mềm | Docker Engine + compose plugin, `rsync`, `curl`, `openssl`. |
| Repo GitHub | **Private** (runner self-hosted không được gắn với repo public). |

## 1. Chuẩn bị server (làm 1 lần)

```bash
sudo mkdir -p /opt/vattu-mcp/deploy/certs && sudo chown -R $USER /opt/vattu-mcp
cd /opt/vattu-mcp/deploy

# .env — chép nội dung deploy/.env.example rồi điền
nano .env                     # SERVER_DOMAIN, PUBLIC_HTTPS_PORT, TRUSTED_PROXY_IP
echo "VT_ENC_KEY=$(openssl rand -base64 32)" >> .env
chmod 600 .env

# Chứng chỉ do IT cấp
cp /đường/dẫn/fullchain.crt certs/server.crt
cp /đường/dẫn/private.key   certs/server.key
chmod 600 certs/server.key
```

> **Giữ bản sao `VT_ENC_KEY` ở nơi an toàn.** Mất khoá không mất dữ liệu nghiệp vụ, chỉ khiến mọi người
> phải kết nối (đăng nhập ERP) lại.

## 2. Cài runner self-hosted

GitHub → repo → *Settings → Actions → Runners → New self-hosted runner* (Linux x64), cài **trên server**,
thêm nhãn riêng (vd `vattu`), chạy dưới user có quyền `docker` và ghi được `/opt/vattu-mcp`, cài thành service
(`sudo ./svc.sh install && sudo ./svc.sh start`).

Rồi khai báo *Settings → Secrets and variables → Actions → **Variables***:

| Biến | Giá trị |
|---|---|
| `DEPLOY_ENABLED` | `true` (chưa đặt → push chỉ chạy test, không deploy) |
| `DEPLOY_RUNNER` | nhãn runner, vd `vattu` (mặc định `self-hosted`) |
| `DEPLOY_DIR` | `/opt/vattu-mcp` (mặc định) |

## 3. Deploy

Push lên `main` (hoặc *Actions → Deploy → Run workflow*). Workflow:

1. **CI trên cloud**: kiểm kiểu, 38 test (OAuth với ERP giả lập, kiểm quyền, đối chiếu lõi == script gốc plugin),
   `npm audit`, build 2 image, dựng stack sau nginx và kiểm 401/metadata/421/DCR.
2. **Trên server**: rsync code (giữ `.env`, `certs/`, `shared/`) → `scripts/preflight.sh` → build image tag = 7 ký tự SHA
   → `up -d` → `scripts/health-check.sh` qua chính nginx. **Hỏng thì tự quay về bản trước.**
3. Giữ 5 bản image gần nhất để rollback.

Deploy tay (khi chưa có runner), từ máy có repo:

```bash
rsync -a --delete --exclude .git --exclude node_modules --exclude deploy/.env --exclude deploy/certs \
  --exclude deploy/shared --exclude deploy/docker-compose.override.yml ./ server:/opt/vattu-mcp/
ssh server 'cd /opt/vattu-mcp/deploy && chmod +x *.sh scripts/*.sh && ./scripts/preflight.sh \
  && ./scripts/write-override.sh manual1 && docker compose build && docker compose up -d --no-build \
  && ./scripts/health-check.sh'
```

## 4. Nghiệm thu sau deploy

```bash
# Từ máy bất kỳ ra được internet:
curl -s https://<SERVER_DOMAIN>/.well-known/oauth-protected-resource/mcp     # resource = https://<SERVER_DOMAIN>/mcp
curl -si -X POST https://<SERVER_DOMAIN>/mcp -d '{}' | grep -i www-authenticate  # 401 + resource_metadata

# Kiểm thử đầu-cuối thật (đăng nhập ERP + gọi đủ 7 tool, chỉ đọc). Tài khoản nhập qua biến môi trường, không ghi file:
cd mcp && npm ci
VT_SMOKE_URL=https://<SERVER_DOMAIN> VT_SMOKE_USER=<tài khoản ERP> VT_SMOKE_PASSWORD=<mật khẩu> npm run smoke
```

## 5. Kết nối từ Claude / ChatGPT (gửi cho người dùng)

| Nơi dùng | Cách thêm |
|---|---|
| claude.ai / Claude Desktop | *Settings → Connectors → Add custom connector* → URL `https://<SERVER_DOMAIN>/mcp` → **Connect** → đăng nhập **tài khoản ERP** |
| Claude Code | `claude mcp add --transport http vattu https://<SERVER_DOMAIN>/mcp` → `/mcp` → đăng nhập |
| ChatGPT (Business/Enterprise) | Admin bật *Developer mode / custom connectors* → *Settings → Apps & Connectors → Create* → URL như trên, xác thực OAuth → đăng nhập ERP |

Kiểm tra nhanh trong chat: *"Tôi đang dùng tài khoản ERP nào?"* (tool `toi_la_ai`).

## 6. Vận hành

| Việc | Lệnh (trong `/opt/vattu-mcp/deploy`) |
|---|---|
| Trạng thái | `docker compose ps` · `./list-releases.sh` |
| Log | `docker compose logs -f mcp` (JSON, không chứa mật khẩu/token) |
| Rollback | *Actions → Rollback → nhập tag*, hoặc `./rollback.sh <tag>` |
| Ai đã dùng gì | `docker compose exec mcp node -e "const {DatabaseSync}=require('node:sqlite');console.table(new DatabaseSync('/data/vattu-mcp.db').prepare('select datetime(ts,\"unixepoch\",\"localtime\") t, username, action, ok, ms from audit order by id desc limit 50').all())"` |
| Buộc mọi người đăng nhập lại | Đổi `VT_ENC_KEY` trong `.env` rồi `docker compose up -d` (hoặc xoá volume `vattu-mcp_vattu_data`) |
| Cắt quyền một người | Làm trên **ERP** (rút quyền / khoá tài khoản). Hiệu lực ở lần MCP làm mới token ERP kế tiếp (≤ 1 giờ). |

## 7. Bảo mật — điểm cần biết

- Chế độ đăng nhập hiện tại: form của MCP chuyển tài khoản/mật khẩu **một lần** tới ERP (`password` grant,
  client `CxmApi_App` có sẵn). Mật khẩu không lưu, không log. ERP tự quyết xác thực và quyền.
  Nếu đội ERP tắt `password` grant / client này, MCP ngừng đăng nhập được — báo trước cho họ (MCP-PLAN.md mục 3.6).
- Token ERP lưu mã hoá AES-256-GCM (khoá `VT_ENC_KEY`), token MCP chỉ lưu băm SHA-256.
- Mỗi tool kiểm `grantedPolicies` ERP của chính người gọi; dữ liệu ERP gọi bằng token của chính họ.
- Chỉ đọc: không tool nào ghi lên ERP.
- `redirect_uri` chỉ chấp nhận Claude, ChatGPT và loopback (Claude Code); đổi qua `VT_ALLOWED_REDIRECT_URIS`.
