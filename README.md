# AI Chuẩn hóa vật tư ERP — MCP server

Chuyển plugin `ai-chuan-hoa-erp` 2.0.13 (skill chạy offline trong sandbox ChatGPT/Claude) thành **MCP server từ xa**:
người dùng kết nối từ Claude hoặc ChatGPT, **đăng nhập bằng tài khoản ERP của chính mình**, và mọi dữ liệu ERP
được đọc với đúng quyền admin ERP đã cấp cho họ.

| Thư mục | Nội dung |
|---|---|
| [`plugin/`](plugin/) | Bản gốc plugin 2.0.13 — **nguồn sự thật** của lõi `normalizer.js` và dữ liệu đóng gói (image Docker lấy thẳng từ đây) |
| [`mcp/`](mcp/) | MCP server (Node 24 + TypeScript chạy trực tiếp, không bước build) |
| [`deploy/`](deploy/) | docker compose, nginx, script deploy/rollback — xem [deploy/README.md](deploy/README.md) |
| [`.github/workflows/`](.github/workflows/) | CI (test + build + kiểm stack), Deploy (runner self-hosted), Rollback |
| [`MCP-PLAN.md`](MCP-PLAN.md) | Phân tích vì sao cần MCP, khảo sát xác thực ERP, quyết định thiết kế |

## Tool

| Tool | Chức năng | Quyền ERP cần |
|---|---|---|
| `chuan_hoa_vat_tu` | Lõi chuẩn hóa 1–500 mô tả + đối chiếu trực tiếp ERP (ma trận, giá trị) | `Company.Material.Group.Read`, `.Item.Read` (+ quyền đọc từng danh sách giá trị) |
| `tim_vat_tu` | Tìm Vật tư trên ERP, có thể trong một Nhóm | `.Group.Read`, `.Item.Read` |
| `xem_ma_tran` | Ma trận quản lý thông số (cột bắt buộc) đọc trực tiếp ERP | + `.CodeRule.Read` |
| `kiem_tra_gia_tri` | Giá trị có trong ERP / đã gán cho nhóm / đang ngưng | `.Group.Read` + quyền từng danh sách |
| `xuat_file_ket_qua` | File .xlsx theo mẫu Đơn hàng/Nhập kho, Up định mức, bảng 10 cột (link 60 phút) | đăng nhập |
| `toi_la_ai` | Tài khoản ERP đang kết nối và quyền vật tư | đăng nhập |
| `trang_thai_du_lieu` | Phiên bản lõi/snapshot, ERP có truy cập được không | đăng nhập |

Resource `vt://huong-dan/*` (hướng dẫn rà soát, quy cách đóng gói, kích thước máng cáp, quy trình file) và prompt `chuan_hoa_vat_tu`.

## Phát triển

```bash
cd mcp
npm ci
npm run check            # kiểm kiểu + 38 test (không cần ERP thật)
npm run dev              # http://localhost:8080 — mặc định dùng ERP thật của Hawee
claude mcp add --transport http vattu-dev http://localhost:8080/mcp   # thử bằng Claude Code
VT_SMOKE_URL=http://localhost:8080 VT_SMOKE_USER=... VT_SMOKE_PASSWORD=... npm run smoke   # kiểm thử đầu-cuối với ERP thật
```

Cập nhật dữ liệu/lõi: thay thư mục `plugin/` bằng bản plugin mới → `npm run check` (test đối chiếu sẽ báo nếu lõi đổi hành vi) → push.
