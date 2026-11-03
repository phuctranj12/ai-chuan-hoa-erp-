// Kiểm thử đầu-cuối trên MCP đang chạy, đi đúng luồng của Claude/ChatGPT:
//   DCR → /authorize → form đăng nhập ERP → code → /token (PKCE) → gọi tool qua /mcp.
// Dùng: VT_SMOKE_URL=https://<domain> VT_SMOKE_USER=... VT_SMOKE_PASSWORD=... node scripts/smoke-e2e.ts
// Tài khoản lấy từ biến môi trường, KHÔNG ghi vào file/repo. Script chỉ gọi tool đọc.
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = new URL(process.env.VT_SMOKE_URL || "http://localhost:8080");
const username = process.env.VT_SMOKE_USER, password = process.env.VT_SMOKE_PASSWORD;
if (!username || !password) {
  console.error("Thiếu VT_SMOKE_USER / VT_SMOKE_PASSWORD");
  process.exit(2);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`KHÔNG ĐẠT: ${message}`);
  console.log(`  ✓ ${message}`);
}

const redirectUri = "http://127.0.0.1:53682/callback";
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

console.log(`MCP: ${base.href}`);
const prm = await (await fetch(new URL("/.well-known/oauth-protected-resource/mcp", base))).json() as { resource: string; authorization_servers: string[] };
check(prm.resource === new URL("/mcp", base).href, `protected resource = ${prm.resource}`);

const registered = await fetch(new URL("/register", base), {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "smoke-e2e", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] }),
});
const client = await registered.json() as { client_id: string };
check(registered.status === 201 && client.client_id, "đăng ký client (DCR)");

const authorizeUrl = new URL("/authorize", base);
for (const [k, v] of Object.entries({ client_id: client.client_id, redirect_uri: redirectUri, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "smoke", resource: prm.resource })) {
  authorizeUrl.searchParams.set(k, v);
}
const page = await fetch(authorizeUrl, { redirect: "manual" });
const html = await page.text();
const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0];
const pending = /name="pending" value="([^"]+)"/.exec(html)?.[1], csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
check(page.status === 200 && pending && csrf && cookie, "trang đăng nhập ERP");

const login = await fetch(new URL("/oauth/login", base), {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie },
  body: new URLSearchParams({ pending: pending!, csrf: csrf!, username, password }),
});
const location = login.headers.get("location") ?? "";
check(login.status === 302 && location.startsWith(redirectUri), `ERP chấp nhận đăng nhập (HTTP ${login.status})`);
const code = new URL(location).searchParams.get("code");
check(new URL(location).searchParams.get("state") === "smoke" && code, "nhận authorization code + state");

const tokenResponse = await fetch(new URL("/token", base), {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code: code!, code_verifier: verifier, redirect_uri: redirectUri, resource: prm.resource }),
});
const tokens = await tokenResponse.json() as { access_token: string; refresh_token: string };
check(tokenResponse.ok && tokens.access_token && tokens.refresh_token, "đổi code lấy token (PKCE)");

const replay = await fetch(new URL("/token", base), {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code: code!, code_verifier: verifier, redirect_uri: redirectUri }),
});
check(replay.status === 400, "dùng lại code bị từ chối");

// Dùng lại code đã huỷ cả phiên (đúng chuẩn OAuth 2.1) → đăng nhập lại cho phần gọi tool.
async function freshToken(): Promise<string> {
  const p = await fetch(authorizeUrl, { redirect: "manual" });
  const h = await p.text();
  const c = (p.headers.get("set-cookie") ?? "").split(";")[0];
  const l = await fetch(new URL("/oauth/login", base), {
    method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: c },
    body: new URLSearchParams({ pending: /name="pending" value="([^"]+)"/.exec(h)![1], csrf: /name="csrf" value="([^"]+)"/.exec(h)![1], username: username!, password: password! }),
  });
  const k = new URL(l.headers.get("location")!).searchParams.get("code")!;
  const t = await fetch(new URL("/token", base), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code: k, code_verifier: verifier, redirect_uri: redirectUri }),
  });
  return (await t.json() as { access_token: string }).access_token;
}
const oldToken = await fetch(new URL("/mcp", base), { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
check(oldToken.status === 401, "token của phiên bị huỷ không còn dùng được");

const accessToken = await freshToken();
const mcp = new Client({ name: "smoke-e2e", version: "1" });
await mcp.connect(new StreamableHTTPClientTransport(new URL("/mcp", base), { requestInit: { headers: { authorization: `Bearer ${accessToken}` } } }));
const tools = (await mcp.listTools()).tools.map(t => t.name).sort();
check(tools.length >= 7, `tools/list: ${tools.join(", ")}`);
const resources = (await mcp.listResources()).resources.map(r => r.uri);
check(resources.includes("vt://huong-dan/ra-soat"), `resources: ${resources.length}`);

const call = async (name: string, args: Record<string, unknown>) => {
  const result = await mcp.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  if (result.isError) throw new Error(`${name} lỗi: ${text}`);
  return result.structuredContent as Record<string, any>;
};

const me = await call("toi_la_ai", {});
console.log("    tài khoản:", me["Mã nhân viên"], me["Họ tên"], me["Vai trò ERP"], `${me["Quyền vật tư ERP"].length} quyền vật tư`);
check(me["Mã nhân viên"], "toi_la_ai");

const normalized = await call("chuan_hoa_vat_tu", {
  items: [
    { identityText: "Ba chạc vuông uPVC DN90x60" },
    { identityText: "Co ren DN20" },
    { identityText: "Ống luồn dây D20 màu trắng" },
    { identityText: "Ống uPVC D110 PN10 ISO 1452" },
  ],
});
for (const row of normalized.items) {
  console.log(`    ${row.row}. ${row.source} → ${row.result["Nhóm vật tư"]} | ${row.result["Vật tư"]} | ${row.result["Kích thước"]} | KT ERP: ${row["Kiểm tra ERP"] || "(trống)"} | ${row.evidence}`);
}
check(normalized.summary.rows === 4, `chuan_hoa_vat_tu: ${JSON.stringify(normalized.summary.evidence)}`);

const found = await call("tim_vat_tu", { tu_khoa: "Tê thu", nhom_vat_tu: "Ống uPVC & phụ kiện" });
check(found.items.some((i: any) => i["Vật tư"] === "Tê thu uPVC"), `tim_vat_tu: ${found.total} kết quả`);

const matrix = await call("xem_ma_tran", { vat_tu: "Ống luồn dây PVC", nhom_vat_tu: "Ống luồn dây PVC & phụ kiện" });
check(Array.isArray(matrix["Cột bắt buộc (V)"]), `xem_ma_tran: ${matrix["Cột bắt buộc (V)"].join(", ")}`);

const values = await call("kiem_tra_gia_tri", { nhom_vat_tu: "Ống uPVC & phụ kiện", kich_thuoc: "D110x60", dai_thong_so: "PN10", tieu_chuan: "ISO 1452", hoan_thien: "màu trắng" });
for (const v of values.ket_qua) console.log(`    ${v.column} ${v.part}: ${v.status}${v.matched ? ` (${v.matched})` : ""}`);
check(values.ket_qua.length >= 4, "kiem_tra_gia_tri");

const file = await call("xuat_file_ket_qua", { mau: "don_hang_nhap_kho", dong: normalized.items.map((r: any) => ({ ...r.result, "Kiểm tra ERP": r["Kiểm tra ERP"] })) });
const download = await fetch(file.download_url.replace(new URL(file.download_url).origin, base.origin));
const bytes = Buffer.from(await download.arrayBuffer());
check(download.ok && bytes.subarray(0, 2).toString() === "PK", `xuat_file_ket_qua: ${file.ten_file} (${bytes.length} byte)`);

const status = await call("trang_thai_du_lieu", {});
check(status.erpReachable === true, `trang_thai_du_lieu: snapshot ${status.snapshot.importDate}, plugin ${status.pluginVersion}`);

await mcp.close();
console.log("\nĐẠT TẤT CẢ");
