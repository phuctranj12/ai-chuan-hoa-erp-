# Kế hoạch chuyển plugin "AI Chuẩn hóa vật tư ERP" thành MCP server

> Ngày lập: **2026-11-03** (cập nhật cùng ngày: chốt đăng nhập qua ERP theo từng người dùng)
> Nguồn: plugin `ai-chuan-hoa-erp` 2.0.13 (đã chép vào [`plugin/`](plugin/))
> Tham khảo: `D:\Git\CATALOGUE\ERP-API-REFERENCE.md` (khảo sát 09/2026) ·
> `D:\Git\git_HR\AI_HR_BE\KHUNG_CHUAN_MCP_va_Xac_Thuc_UserManagement.md` (khung MCP công ty) ·
> code OAuth proxy cũ `catalogue/mcp-erp/` trong git history repo CATALOGUE (commit `56d0707`…`243f416`)
>
> Mọi kết quả ở mục 2 là **gọi thật ngày 2026-11-03**, dùng tài khoản test `05923`
> (role `DA-Kỹ sư thiết kế`), chỉ GET — không ghi gì lên ERP.

---

## Trạng thái (2026-11-03)

| Phase | Trạng thái |
|---|---|
| 1 — Lõi + tool | **Xong.** `mcp/` — 7 tool, 4 resource, 1 prompt. Lõi plugin chạy nguyên bản; test đối chiếu 36 mô tả cho kết quả giống hệt `normalize-materials.mjs`. |
| 2 — OAuth mặt tiền + `erp_password` | **Xong.** DCR (allowlist redirect), PKCE S256, code/refresh dùng một lần (dùng lại → huỷ phiên), token ERP mã hoá AES-GCM, kiểm `grantedPolicies` từng tool, giới hạn đăng nhập theo IP + tài khoản. |
| 3 — Dữ liệu sống | **Một phần.** Đối chiếu trực tiếp (Nhóm/Vật tư, ma trận, Kích thước/Dải/Tiêu chuẩn/Hoàn thiện/Kiểu lắp đặt/Xuất xứ) **xong**. Lõi vẫn chạy trên snapshot 2.0.13 — đồng bộ toàn bộ danh mục BIM vào lõi (`sync/`) chưa làm. Quy cách đóng gói chưa kiểm trực tiếp được. |
| CI/CD | **Xong, chờ server.** CI (cloud), Deploy + Rollback (runner self-hosted), tự rollback khi kiểm tra sống hỏng. Bật bằng biến `DEPLOY_ENABLED=true`. |
| 4 — `erp_oidc` | Tuỳ chọn, chưa làm (cần đội ERP cấp client `HaweeMcp`). |
| 5 — Plugin 3.0.0, tool ghi | Chưa làm. |

Đã kiểm: 38 test tự động; kiểm thử đầu-cuối với **ERP thật** (tài khoản test 05923) trên cả bản chạy local lẫn image Docker;
stack Docker + nginx (TLS, 401/metadata, 421 với IP thô, DCR lạ bị từ chối); mô phỏng deploy → deploy bản 2 → rollback.

---

## 0. Tóm tắt 1 phút

| Câu hỏi | Trả lời ngắn |
|---|---|
| Plugin hiện tại là gì? | Một **skill** (hướng dẫn + `normalizer.js` + 34 MB snapshot JSON) chạy trong sandbox ChatGPT/Claude. Không gọi ERP, không có xác thực. |
| Vì sao ERP không dùng được qua plugin? | Sandbox không làm được OAuth, không giữ phiên, không được cầm mật khẩu; ERP đã chuyển sang **BFF + cookie HttpOnly** nên trình duyệt không cầm token. Kênh duy nhất để Claude/ChatGPT gọi hệ thống có xác thực là **MCP server từ xa + OAuth**. |
| Dữ liệu vật tư ở đâu? | **BIM Service** `https://bim.erp.hawee.com.vn` — đã gọi được bằng token của người dùng. |
| Đăng nhập thế nào? | **Đăng nhập bằng tài khoản ERP của từng người.** MCP làm *authorization server mặt tiền* cho Claude/ChatGPT, phía sau đổi lấy token OpenIddict của ERP; mọi lời gọi ERP dùng **token của chính người đó** → phân quyền chi tiết do admin ERP cấu hình được áp nguyên vẹn. |
| Có chạy được ngay không? | **Có, không cần đội ERP sửa gì**: chế độ `erp_password` (`password` grant qua client `CxmApi_App` có sẵn, form đăng nhập do MCP host). ERP vẫn tự xác thực mật khẩu và tự quyết quyền trên mọi lời gọi. Chế độ `erp_oidc` (client `HaweeMcp`) là tuỳ chọn nâng cấp nếu sau này đội ERP muốn — xem 3.6. |
| Ngôn ngữ | **Node.js/TypeScript** — dùng lại nguyên `normalizer.js`. |

---

## 1. Vì sao plugin không đủ, phải chuyển sang MCP

### 1.1 Plugin thực chất làm gì

- `SKILL.md`: *"Skill không dùng MCP, `localhost`, Add-in Excel desktop hoặc API ERP"*.
- Lõi `scripts/normalize-materials.mjs` → `normalizer.js` đọc snapshot `catalogs.json` (13,5 MB),
  `training.json` (12,7 MB), `AllSizes.json` (7,4 MB)…
- `data-provenance.json`: 7 danh mục thuộc tính nhập 02/11/2026; **Nhóm vật tư, Vật tư, Ma trận giữ từ bản 2.0.7**.
- "Kiểm tra ERP trực tiếp" = AI điều khiển tab Chrome qua ChatGPT Extension, đọc giao diện.

### 1.2 Giới hạn không khắc phục được trong mô hình plugin

| # | Giới hạn | Hệ quả |
|---|---|---|
| 1 | **Không có chỗ cho xác thực.** Manifest plugin không có trường auth; sandbox không mở được trang login, không nhận redirect OAuth, không lưu refresh token. | Muốn gọi API ERP phải nhét mật khẩu/token vào skill → lộ cho mọi người cài. Skill tự cấm (nguyên tắc 6). |
| 2 | **Không có danh tính người dùng.** Dù có token chung, ERP cũng chỉ thấy *một* tài khoản. | Không áp được phân quyền chi tiết theo từng người (yêu cầu bắt buộc). |
| 3 | **Sandbox không có đường mạng ổn định tới ERP.** | Không gọi được `bim.erp.hawee.com.vn`. |
| 4 | **ERP đã chuyển sang BFF** (mục 2.2): trình duyệt chỉ có cookie `HttpOnly` + `XSRF-TOKEN`. | Qua Extension Chrome chỉ *đọc màn hình*: chậm, dễ gãy, chỉ chạy trên máy có Chrome đăng nhập, không chạy trên Claude web/ChatGPT web, không xử lý nổi file 5.000 dòng. |
| 5 | **Dữ liệu đóng băng**, mỗi lần đổi danh mục phải phát hành lại plugin. | Kết quả lệch ERP. |
| 6 | **Phụ thuộc Node của nền tảng + 34 MB mỗi phiên.** | Môi trường không có Node → skill không chạy. |

### 1.3 MCP giải quyết thế nào

| Điểm | Với MCP server từ xa |
|---|---|
| Xác thực | Claude/ChatGPT tự chạy **OAuth 2.1 + PKCE + DCR** theo spec MCP. Người dùng đăng nhập bằng tài khoản ERP của mình, AI chỉ cầm token ngắn hạn của MCP — không bao giờ cầm token ERP hay mật khẩu. |
| Phân quyền | MCP gọi ERP bằng token **của từng người** + đọc `grantedPolicies` của họ để ẩn/chặn tool. Admin ERP cấp/rút quyền như hiện nay, không có hệ quyền thứ hai. |
| Mạng / BFF | Lõi chạy trên server công ty, gọi thẳng BIM API bằng Bearer, không cần cookie trình duyệt. |
| Dữ liệu | Danh mục kéo từ BIM API; snapshot đóng gói chỉ là dự phòng. |
| Quản trị | Audit log theo `sub`/mã nhân viên. |

> Plugin trở thành vỏ phân phối: hướng dẫn nghiệp vụ chuyển thành `instructions`/prompt/resource
> của MCP; manifest khai báo URL MCP. Không cài plugin vẫn dùng được bằng cách thêm connector theo URL.

---

## 2. Khảo sát xác thực ERP (kiểm chứng 2026-11-03)

### 2.1 Bản đồ hệ thống

| Thành phần | Host | Ghi chú |
|---|---|---|
| Frontend | `https://www.erp.hawee.com.vn` | SPA React, `VITE_BFF_URL=https://bff.erp.hawee.com.vn` |
| BFF | `https://bff.erp.hawee.com.vn` | Proxy `/cxm` `/bim` `/warehouse` `/po`; client OIDC `HaweeBff` |
| Authorization server | `https://cm-api.erp.hawee.com.vn/` | ABP + OpenIddict |
| **BIM Service** (danh mục vật tư) | `https://bim.erp.hawee.com.vn` | Swagger công khai, 572 path, Bearer |

### 2.2 Kết quả kiểm chứng

**Discovery / client**

| Kiểm tra | Kết quả |
|---|---|
| OIDC discovery + RFC 8414 | 200, mọi endpoint `https://` (blocker B1 cũ **đã sửa**) |
| DCR (`registration_endpoint`) | **Không có** |
| PKCE | `S256`, `plain` |
| BFF login | 302 → `/connect/authorize?client_id=HaweeBff&redirect_uri=https://bff.erp.hawee.com.vn/api/auth/callback-oidc` |
| `CxmApi_App` + `authorization_code` với redirect `claude.ai`, `chatgpt.com`, domain MCP, `localhost`, kể cả `www.erp.hawee.com.vn` | **400 ID2043** *"redirect_uri is not valid for this client"* → **không dùng được** cho MCP |
| `CxmApi_App` + device flow | **ID2056** *"not allowed to use the device authorization endpoint"* |

**Đăng nhập bằng tài khoản người dùng (`password` grant, `CxmApi_App`)**

| Kiểm tra | Kết quả |
|---|---|
| `POST /connect/token` scope `openid profile email roles offline_access CxmApi` | **200**, `expires_in 3600`, có `refresh_token` + `id_token` |
| Access token | `typ at+jwt`, RS256, `iss https://cm-api.erp.hawee.com.vn/`, `aud CxmApi`, `sub` (GUID), `preferred_username` = mã NV `05923`, `email`, `role` `DA-Kỹ sư thiết kế`, `client_id CxmApi_App` |
| Refresh | 200, **refresh token xoay vòng** (token mới khác token cũ); token cũ dùng lại ngay vẫn 200 (khoảng ân hạn mặc định của OpenIddict) → MCP phải lưu token mới sau mỗi lần refresh |
| `GET cm-api /api/account/my-profile` | 200 |
| `GET cm-api /api/abp/application-configuration` | 200 — **145 `grantedPolicies`** của người dùng, ví dụ `Company.Material.Group.Read`, `.Item.Read`, `.Size.Read`, `.SpecRange.Read`, `.Standard.Read`, `.Finishing.Read`, `.InstallationType.Read`, `.Origin.Read`, `.InstallationSpace.Read`, `.CodeRule.Read`, `.LibrarySpec.Create/Update` |

**BIM API bằng token của người dùng — tất cả 200**

| Endpoint | Mẫu dữ liệu |
|---|---|
| `/api/ItemGroup/list` | `{"name":"Thang cáp & phụ kiện tôn đen","code":"ETB"…}` |
| `/api/Item/list` | `{"code":"PHC","name":"Ống HDPE gân sóng 2 lớp","shapeMajor":"Ống"…}` |
| `/api/Size/list` | kèm `itemGroupSizes[]` (quan hệ kích thước ↔ nhóm) |
| `/api/Range/list` | kèm `itemGroupRanges[]` |
| `/api/Specification/list` | `ASTM A53`, `ASTM A106`… |
| `/api/Finish/list` | 100 bản ghi (khớp `AllFinishes` 100 dòng) |
| `/api/InstallType/list` | 27 bản ghi |
| `/api/PackagingItem/list` | kèm `itemPackagingItems[]` |
| `/CodeGenConditionField/list` | **ma trận**: `{"itemName":"Ăng-ten","itemCode":"EHA016","itemGroupName":"Âm thanh hội trường","fields":["manufacture",…]}` |
| `/api/Discipline/list` | 7 bản ghi (ELEC, ELEV…) |

**Chưa kiểm chứng**
- BIM có **tự chặn** theo policy không (VD người thiếu `Company.Material.Size.Read` gọi `/api/Size/list`
  có bị 403?). Cần thêm một tài khoản test bị rút quyền. Dù kết quả thế nào, MCP vẫn tự chặn theo
  `grantedPolicies` (mục 4.3) — phòng thủ hai lớp.
- `InstallType` ERP có 27 bản ghi, snapshot `AllInstallType` 43 dòng → cần đối chiếu khi viết `sync/`.

### 2.3 Endpoint BIM dùng cho MCP

| Dữ liệu plugin | Endpoint BIM (GET) | Policy ERP liên quan |
|---|---|---|
| Lĩnh vực / Nhóm vật tư | `/api/Discipline/list`, `/api/ItemGroup/list` | `Company.Material.Discipline.Read`, `.Group.Read` |
| Vật tư | `/api/Item/list`, `/api/Item/getItems` | `.Item.Read` |
| Ma trận quản lý thông số | **`/CodeGenConditionField/items-in-group?itemGroupCode=…&type=0&isExisting=1`** — `items[].fields` = cột có dấu V (`itemgroup, item, size, range, specification, installtype, finish, material`→Thông số kỹ thuật khác`, packagingitem, unit, manufacture, origin, model, itemmajor`). Lưu ý: `/CodeGenConditionField/list` chỉ trả cấu hình mặc định (`isExisting:false`), **không** phải ma trận | `.CodeRule.Read` *(cần xác nhận)* |
| Kích thước | `/api/Size/list`, `POST /api/Size/list-by-item-groups` | `.Size.Read` |
| Dải thông số | `/api/Range/list` | `.SpecRange.Read` |
| Tiêu chuẩn | `/api/Specification/list` | `.Standard.Read` |
| Hoàn thiện | `/api/Finish/list` | `.Finishing.Read` |
| Kiểu lắp đặt | `/api/InstallType/list` | `.InstallationType.Read` |
| Xuất xứ / Không gian lắp đặt | `/api/Origin/list`, `/api/InstallationSpace/list` | `.Origin.Read`, `.InstallationSpace.Read` |
| Quy cách đóng gói | `/api/PackagingItem/list`, `/getBySpecItemCode` | *(chưa xác định)* |

---

## 3. Phương án xác thực: MCP đăng nhập qua ERP, token theo từng người

### 3.1 Vì sao MCP phải đứng làm authorization server mặt tiền

- ERP không có DCR, còn Claude/ChatGPT cần DCR (hoặc client cấu hình sẵn cho từng nền tảng).
- Token ERP có `aud=CxmApi`, không gắn với MCP → nếu Claude chuyển thẳng token ERP vào MCP thì là
  *token passthrough* (spec MCP cấm).
- → MCP tự phát token **của MCP** cho Claude/ChatGPT; token ERP chỉ nằm trên server MCP (mã hoá).
  Đây đúng kiến trúc của `catalogue/mcp-erp/app/oauth.py` cũ.

### 3.2 Luồng

```
Claude / ChatGPT                   MCP server (<domain>)                         ERP cm-api / BIM
────────────────                   ─────────────────────                         ────────────────
POST /mcp (không token) ───────▶   401 + WWW-Authenticate: resource_metadata
GET /.well-known/oauth-protected-resource  → authorization_servers = [https://<domain>]
GET /.well-known/oauth-authorization-server (của MCP)
POST /oauth/register (DCR) ────▶   cấp client_id (public, PKCE)
GET /oauth/authorize?…PKCE… ───▶   lưu yêu cầu, rồi tuỳ chế độ upstream:
                                    (1) erp_oidc  : 302 ─────────────────────▶ /connect/authorize?client_id=HaweeMcp
                                                                                người dùng đăng nhập TRÊN TRANG ERP
                                       /oauth/erp-callback ◀── code ──────────
                                       đổi code → token ERP ─────────────────▶ /connect/token
                                    (2) erp_password: trang đăng nhập của MCP
                                       POST form ─ password grant ───────────▶ /connect/token (CxmApi_App)
                                   lấy grantedPolicies ─────────────────────▶ /api/abp/application-configuration
                                   lưu phiên: sub, mã NV, email, policies,
                                   refresh token ERP (AES-GCM)
◀── 302 redirect_uri?code=… ───
POST /oauth/token (PKCE) ──────▶   phát access token MCP (60') + refresh token MCP
POST /mcp + Bearer MCP ────────▶   tra phiên → token ERP còn hạn? (refresh nếu < 5')
                                   kiểm policy cho tool ──▶ gọi BIM bằng token ERP CỦA NGƯỜI ĐÓ ──▶ BIM
```

### 3.3 Hai chế độ upstream (cùng một code, chọn bằng `VT_MCP_ERP_AUTH_MODE`)

| | `erp_oidc` — **đích đến** | `erp_password` — **tạm thời, chạy được ngay** |
|---|---|---|
| Người dùng nhập mật khẩu ở | trang ERP `cm-api.erp.hawee.com.vn` | form của MCP (HTTPS), MCP chuyển thẳng tới `/connect/token`, **không lưu, không log** |
| Client ERP | `HaweeMcp` (admin ERP tạo) | `CxmApi_App` (đã có) |
| Cần IT | Đăng ký client + redirect URI | Không |
| MFA / chính sách đăng nhập ERP | Áp đầy đủ | Bị bỏ qua |
| Rủi ro | Thấp | MCP thấy mật khẩu; tập cho người dùng gõ mật khẩu ERP trên domain khác (dễ bị lợi dụng phishing); vỡ nếu IT tắt `password` grant (đã nằm trong danh sách cảnh báo bảo mật) |
| Dùng cho | Production | Pilot nhóm nhỏ trong lúc chờ IT |

### 3.4 Phân quyền chi tiết

- Lúc đăng nhập và mỗi lần refresh token ERP (≤ 60 phút): gọi `/api/abp/application-configuration`
  bằng token người dùng, lưu `grantedPolicies` vào phiên.
- Mỗi tool khai báo policy cần có (mục 4.1). Thiếu policy → tool trả lỗi
  *"Tài khoản ERP của bạn chưa được cấp quyền …"* và không gọi ERP.
- Gọi BIM luôn bằng token của chính người dùng → nếu BIM tự kiểm quyền thì đó là lớp thứ hai.
- Admin rút quyền trên ERP → có hiệu lực ở lần refresh kế tiếp (≤ 60'). Khoá tài khoản/đổi mật khẩu →
  refresh token ERP bị từ chối → MCP huỷ phiên, Claude/ChatGPT yêu cầu đăng nhập lại.
- **Không** dùng tài khoản dịch vụ cho lời gọi theo yêu cầu người dùng.

### 3.5 Dữ liệu dùng chung cho normalizer

`normalizer.js` cần **toàn bộ** danh mục trong bộ nhớ (19k kích thước, ma trận…), không thể tải theo
từng lời gọi. Cách làm giữ đúng phân quyền mà không cần tài khoản dịch vụ:

- Cache dùng chung danh mục **cấp công ty** (`Company.Material.*`), làm mới khi cũ hơn 6 giờ,
  **bằng token của người đang gọi** nếu người đó có đủ các policy `*.Read` liên quan (khoá chống chạy trùng).
- Người gọi chỉ được dùng cache nếu chính họ có các policy tương ứng (kiểm như 3.4).
- Tool kiểm tra trực tiếp (`xem_ma_tran`, `kiem_tra_gia_tri`) luôn gọi BIM sống bằng token người gọi.
- Snapshot 2.0.13 là dự phòng khi ERP không tới được; kết quả ghi rõ nguồn.

### 3.6 Vận hành không cần đội ERP can thiệp (quyết định 2026-11-03)

Nguyên tắc: **bảo mật do ERP quyết định** — MCP không tạo hệ quyền riêng, không có tài khoản dịch vụ,
không sửa gì phía ERP. Chế độ chính thức của dự án là `erp_password`.

**Phần ERP quyết định (MCP không đụng tới):**

| Việc | ERP làm thế nào |
|---|---|
| Ai được đăng nhập | `/connect/token` kiểm mật khẩu, khoá tài khoản, chính sách mật khẩu của ABP Identity |
| Được xem gì | Token của chính người dùng; BIM/cm-api trả gì thì MCP trả nấy |
| Quyền theo chức năng | `grantedPolicies` do admin ERP cấp; MCP chỉ **đọc và áp đúng** danh sách này (không thêm, không bớt quy tắc) |
| Rút quyền / khoá người | Có hiệu lực ở lần refresh kế tiếp (≤ 60'), MCP huỷ phiên khi ERP từ chối refresh |
| Tắt hẳn kênh MCP | Đội ERP tắt `password` grant hoặc client `CxmApi_App` → MCP ngừng đăng nhập được. Đây là quyền của chủ hệ thống, chấp nhận |

**Phần MCP tự chịu trách nhiệm:**

- Không lưu, không log, không cache mật khẩu; chỉ chuyển một lần tới `/connect/token` qua HTTPS.
- Refresh token ERP mã hoá AES-256-GCM; token MCP chỉ lưu băm.
- OAuth mặt tiền cho Claude/ChatGPT (DCR, PKCE S256, allowlist redirect URI, `resource`).
- Form đăng nhập: CSRF, rate-limit, chống clickjacking (`frame-ancestors 'none'`), hiển thị rõ domain MCP.
- Chỉ đọc (`VT_MCP_ENABLE_WRITE=false`), audit log theo mã NV.

**Đã cân nhắc và loại:**

- *Mượn redirect URI đã đăng ký của ứng dụng web ERP* để nhận `authorization_code` (tránh MCP thấy mật khẩu):
  là giả danh client của ERP, có thể va chạm với SPA đang chạy — **không làm**.
- *Dùng phiên BFF/cookie trình duyệt*: cookie `HttpOnly` trên domain BFF, MCP không lấy được — không khả thi.
- *Tài khoản dịch vụ*: trái nguyên tắc phân quyền theo người.

**Nên làm (không bắt buộc, không chặn triển khai):** báo cho đội ERP biết MCP dùng client `CxmApi_App`
với `password` grant, để họ không tắt nhầm và biết nguồn lưu lượng (log ERP sẽ thấy `client_id CxmApi_App`).

---

## 4. Thiết kế MCP server

### 4.1 Tool (giai đoạn đọc — `readOnlyHint: true`)

| Tool | Làm gì | Policy ERP cần |
|---|---|---|
| `chuan_hoa_vat_tu` | `items[] {identityText, attributeText}` (≤ 500/lần) → `normalizer.js` → 10 cột + `Kiểm tra ERP` + `matrixRequired` + nguồn dữ liệu | `Group.Read`, `Item.Read` + các `*.Read` thuộc tính |
| `tim_vat_tu` | Tìm Nhóm/Vật tư theo từ khoá | `Discipline.Read`, `Group.Read`, `Item.Read` |
| `xem_ma_tran` | Hàng ma trận của một Vật tư (trường bắt buộc `V`) — gọi `/CodeGenConditionField` sống | `CodeRule.Read` *(xác nhận)* |
| `kiem_tra_gia_tri` | Từng giá trị có trong danh sách ERP của đúng Nhóm/Vật tư — gọi sống → đạt mức bằng chứng "Đã đối chiếu trực tiếp…" | `Size.Read`, `SpecRange.Read`, `Standard.Read`, `Finishing.Read`, `InstallationType.Read`… theo trường |
| `chuan_hoa_file` | Nhiều lô / file → `download_url` file kết quả (mẫu Up định mức / Đơn hàng-Nhập kho) | như `chuan_hoa_vat_tu` |
| `toi_la_ai` | Tên, mã NV, role, danh sách quyền vật tư hiện có | — |
| `trang_thai_du_lieu` | Thời điểm đồng bộ, số bản ghi, ERP có tới được không | — |

**Resource:** `vt://huong-dan/ra-soat`, `vt://huong-dan/dong-goi`, `vt://huong-dan/may-cap`.
**Prompt:** `chuan_hoa_vat_tu` — trình tự *Lõi đề xuất → AI kiểm định ngữ nghĩa → đối chiếu ERP* + hợp đồng 10 cột.
**`instructions`:** rút gọn SKILL.md (nguyên tắc 1–16), bỏ phần Chrome/sandbox.

Tool ghi (tạo mã vật tư, cập nhật thư viện spec — policy `LibrarySpec.Create/Update`) để giai đoạn sau,
2 pha xem trước → xác nhận bằng lời, `VT_MCP_ENABLE_WRITE=false` mặc định, chỉ bật khi có staging ERP.

### 4.2 Dữ liệu

- Module `sync/` ánh xạ DTO BIM → shape `catalogs.json` mà normalizer đang dùng; test so với snapshot
  2.0.13 để bắt lệch trước khi bật.
- Giữ dạng đóng gói phần **không có trên ERP**: `training.json`, `b3-srh-alias.json`,
  `chuan-hoa-2-alias.json`, `Alias`/`AliasMatrix`, `tray-size-rules-source.tsv`.
- Sau mỗi lần đồng bộ dựng lại `Normalizer` rồi hoán đổi nguyên tử; lỗi → giữ bản cũ.

### 4.3 Bảo mật phần xác thực

- Token MCP: chuỗi ngẫu nhiên 256 bit, DB chỉ lưu **băm SHA-256**; access 60', refresh 30 ngày xoay vòng.
- Refresh token ERP: mã hoá AES-256-GCM, khoá trong env `VT_MCP_ENC_KEY`; không bao giờ ra tool output/log.
- DCR: chỉ cấp client public + PKCE S256; `redirect_uri` theo allowlist:
  `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`,
  `https://chatgpt.com/connector_platform_oauth_redirect`, `http://localhost:*` / `http://127.0.0.1:*` (Claude Code, mcp-remote).
- Kiểm `resource` (RFC 8707) = `VT_MCP_RESOURCE_URL`; mã authorize TTL 60 giây, dùng một lần.
- Chế độ `erp_password`: form có CSRF token, rate-limit theo IP + tài khoản, thông báo lỗi chung chung,
  không lưu mật khẩu ở bất kỳ đâu.
- Màn hình đồng ý hiển thị tên client (Claude/ChatGPT) + quyền; người dùng xem và gỡ kết nối ở `/oauth/sessions`.
- Audit: `sub`, mã NV, tool, tham số rút gọn, thời gian, kết quả.

### 4.4 Cấu trúc repo dự kiến

```
ai-chuan-hoa-erp-/
├── plugin/                    bản gốc 2.0.13 (nguồn normalizer + assets, để đối chiếu)
├── mcp/
│   ├── src/
│   │   ├── index.ts           Streamable HTTP (+ stdio cho dev), log về stderr
│   │   ├── server.ts          McpServer, đăng ký tool/resource/prompt
│   │   ├── config.ts          env VT_MCP_*
│   │   ├── oauth/             metadata.ts, register.ts, authorize.ts, erp-callback.ts,
│   │   │                      login-form.ts (erp_password), token.ts, revoke.ts, sessions.ts
│   │   ├── erp/               oidc.ts (code/password/refresh), policies.ts, bim-client.ts
│   │   ├── store/             SQLite/Postgres: clients, auth_codes, sessions, audit; crypto.ts
│   │   ├── sync/              BIM → catalogs shape, cache dùng chung, hoán đổi nguyên tử
│   │   ├── core/              normalizer.js, tray-*.js (copy nguyên), run.ts
│   │   └── tools/             chuan-hoa.ts, tim-vat-tu.ts, ma-tran.ts, kiem-tra-gia-tri.ts, toi-la-ai.ts, trang-thai.ts
│   ├── assets/                training.json, alias, snapshot dự phòng (Git LFS)
│   ├── test/                  vitest: luồng OAuth đầy đủ (mock ERP), policy gate, mapping BIM, hồi quy normalizer
│   ├── Dockerfile
│   └── package.json           @modelcontextprotocol/sdk, jose, zod, better-sqlite3|pg
├── deploy/                    docker-compose.yml, nginx.conf
└── MCP-PLAN.md
```

---

## 5. Lộ trình

### Phase 0 — Chốt hạ tầng
- [ ] Domain công khai cho MCP (đề xuất `vattu.hawee.com.vn`) + chứng chỉ. Claude/ChatGPT kết nối **từ cloud** → phải vào được từ internet; server MCP phải ra được `cm-api` và `bim.erp.hawee.com.vn`.
- [ ] *(Nên)* Báo đội ERP biết MCP dùng `CxmApi_App` + `password` grant (mục 3.6). Không cần họ sửa gì.
- [ ] Xin thêm 1 tài khoản test **bị rút** vài policy `Company.Material.*.Read` (việc của admin phân quyền,
      không phải đội code ERP) để kiểm BIM có tự chặn không.

### Phase 1 — Lõi + tool trên snapshot (stdio, dev)
- [ ] Dựng `mcp/` TypeScript, copy `normalizer.js` + assets, tool `chuan_hoa_vat_tu`.
- [ ] Test hồi quy: kết quả MCP = `node normalize-materials.mjs` gốc.

### Phase 2 — OAuth mặt tiền + chế độ `erp_password`
- [ ] Metadata RFC 9728/8414, DCR, authorize + form đăng nhập, token/refresh/revoke, store mã hoá.
- [ ] Lấy `grantedPolicies`, policy gate từng tool, `toi_la_ai`.
- [ ] Deploy (nginx: `proxy_buffering off`, `X-Forwarded-Proto`), nghiệm thu:
  - claude.ai → *Settings → Connectors → Add custom connector* → URL `https://<domain>/mcp` → đăng nhập ERP → `toi_la_ai` trả đúng mã NV.
  - ChatGPT → *Settings → Apps & Connectors → Developer mode → Create* bằng URL (workspace Business/Enterprise cần admin bật).
  - Claude Code: `claude mcp add --transport http vattu https://<domain>/mcp`.

### Phase 3 — Dữ liệu sống
- [ ] `bim-client.ts` (phân trang, retry), `sync/` + cache dùng chung, `xem_ma_tran`, `kiem_tra_gia_tri`, `trang_thai_du_lieu`.
- [ ] Đối chiếu số bản ghi ERP ↔ snapshot (VD `InstallType` 27 vs 43).

### Phase 4 — *(tuỳ chọn)* Chế độ `erp_oidc` (chỉ khi đội ERP tự muốn cấp `HaweeMcp`)
- [ ] `/oauth/erp-callback`, đổi code → token; bật `VT_MCP_ERP_AUTH_MODE=erp_oidc`, **tắt** form mật khẩu.
- [ ] Đề nghị IT tắt `password` grant của `CxmApi_App` sau khi chuyển xong.

### Phase 5 — File, plugin 3.0.0, (tuỳ chọn) tool ghi
- [ ] `chuan_hoa_file` + link tải ngắn hạn.
- [ ] Plugin 3.0.0: bỏ phần Chrome/snapshot, khai báo MCP server trong manifest.
- [ ] Tool ghi 2 pha trên staging ERP.

---

## 6. Biểu mẫu gửi admin ERP

```text
Mục đích       : MCP "AI Chuẩn hóa vật tư" — người dùng đăng nhập bằng tài khoản ERP của chính họ,
                 MCP gọi BIM/cm-api bằng token của người đó (phân quyền theo policy hiện có)
Client         : HaweeMcp
Loại           : confidential (client_secret gửi qua kênh bảo mật, không qua chat)
Grant          : authorization_code (PKCE S256 bắt buộc), refresh_token
Scope          : openid profile email roles offline_access CxmApi
Redirect URI   : https://<domain>/oauth/erp-callback
Post-logout URI: https://<domain>/oauth/logged-out
Consent        : implicit/external (nội bộ, không cần màn hình đồng ý của ERP)
Gọi từ         : IP server MCP <…>
```

---

## 7. Rủi ro & việc phải xác minh

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Chế độ `erp_password` bị dùng lâu dài | Cao | Chỉ pilot; Phase 4 tắt hẳn; banner trên form ghi rõ domain chính thức |
| IT tắt `password` grant trước khi có `HaweeMcp` | Trung bình | Gửi yêu cầu client ngay Phase 0 |
| BIM không tự chặn theo policy | Trung bình | MCP luôn chặn theo `grantedPolicies` (đã thiết kế) |
| Tên policy ↔ endpoint ánh xạ sai | Trung bình | Kiểm bằng tài khoản bị rút quyền (Phase 0) |
| DTO BIM khác shape `catalogs.json` | Cao | Test so với snapshot trước khi bật dữ liệu sống |
| Lộ refresh token ERP | Cao | AES-GCM, khoá ngoài DB, gỡ kết nối được, xoay vòng |
| Refresh token ERP xoay vòng, lưu chậm → mất phiên | Thấp | Ghi token mới trong cùng giao dịch; OpenIddict có khoảng ân hạn |
| 34 MB assets trong git | Thấp | Git LFS |

Cảnh báo bảo mật ERP còn mở từ 09/2026 (swagger cm-api/BIM công khai, `password` grant trên public client)
nên chuyển IT.
