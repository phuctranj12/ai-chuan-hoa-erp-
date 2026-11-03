// Luồng xác thực: DCR, trang đăng nhập ERP, PKCE, xoay vòng/thu hồi token, gắn tuổi thọ phiên với ERP.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { callTool, mcpClient, openLogin, pkce, REDIRECT, register, signIn, startApp, submitLogin, tokenRequest, type TestApp } from "./helpers.ts";

let app: TestApp;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

describe("metadata", () => {
  it("quảng bá protected resource và authorization server của chính MCP", async () => {
    const prm = await (await fetch(`${app.base}/.well-known/oauth-protected-resource/mcp`)).json() as any;
    assert.equal(prm.resource, `${app.base}/mcp`);
    assert.deepEqual(prm.authorization_servers, [`${app.base}/`]);
    const as = await (await fetch(`${app.base}/.well-known/oauth-authorization-server`)).json() as any;
    assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
    assert.ok(as.registration_endpoint);
  });

  it("/mcp không token → 401 kèm resource_metadata (ASCII hợp lệ)", async () => {
    const res = await fetch(`${app.base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 401);
    assert.match(res.headers.get("www-authenticate")!, /resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/mcp"/);
  });

  it("token rác → 401, không phải 500", async () => {
    const res = await fetch(`${app.base}/mcp`, { method: "POST", headers: { authorization: "Bearer khong-hop-le", "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 401);
  });
});

describe("đăng ký client (DCR)", () => {
  it("từ chối redirect_uri ngoài danh sách cho phép", async () => {
    const res = await register(app.base, ["https://ke-gian.example/callback"]);
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "invalid_client_metadata");
  });

  it("cho phép loopback (Claude Code / mcp-remote) và callback Claude/ChatGPT", async () => {
    for (const uri of [REDIRECT, "https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect"]) {
      assert.equal((await register(app.base, [uri])).status, 201, uri);
    }
  });
});

describe("đăng nhập ERP", () => {
  it("đúng mật khẩu → chuyển hướng về client kèm code và state", async () => {
    const client = await (await register(app.base)).json() as any;
    const page = await openLogin(app.base, client.client_id, pkce().challenge);
    assert.equal(page.res.status, 200);
    assert.match(page.res.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    const res = await submitLogin(app.base, page, "ky.su@hawee.com.vn", "dung-mat-khau");
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location")!);
    assert.equal(location.origin + location.pathname, REDIRECT);
    assert.equal(location.searchParams.get("state"), "st");
    assert.ok(location.searchParams.get("code"));
  });

  it("sai mật khẩu → báo chung chung, không chuyển hướng; quá 5 lần thì khoá tạm", async () => {
    const client = await (await register(app.base)).json() as any;
    const page = await openLogin(app.base, client.client_id, pkce().challenge);
    for (let i = 0; i < 5; i++) {
      const res = await submitLogin(app.base, page, "khoa.thu@hawee.com.vn", "sai");
      assert.equal(res.status, 401);
      assert.match(await res.text(), /ERP từ chối đăng nhập/);
    }
    const blocked = await submitLogin(app.base, page, "khoa.thu@hawee.com.vn", "sai");
    assert.equal(blocked.status, 429);
  });

  it("giới hạn số lần gửi form đăng nhập theo IP", async () => {
    const local = await startApp({ VT_LOGIN_RATE_PER_MIN: "2" });
    try {
      const client = await (await register(local.base)).json() as any;
      const page = await openLogin(local.base, client.client_id, pkce().challenge);
      const statuses = [];
      for (let i = 0; i < 3; i++) statuses.push((await submitLogin(local.base, page, `ip${i}@hawee.com.vn`, "sai")).status);
      assert.deepEqual(statuses, [401, 401, 429]);
    } finally {
      await local.close();
    }
  });

  it("thiếu cookie trình duyệt hoặc sai csrf → từ chối", async () => {
    const client = await (await register(app.base)).json() as any;
    const page = await openLogin(app.base, client.client_id, pkce().challenge);
    assert.equal((await submitLogin(app.base, { ...page, cookie: "" }, "ky.su@hawee.com.vn", "dung-mat-khau")).status, 400);
    assert.equal((await submitLogin(app.base, { ...page, csrf: "x" }, "ky.su@hawee.com.vn", "dung-mat-khau")).status, 400);
  });

  it("resource khác MCP này → lỗi invalid_target trả về redirect_uri", async () => {
    const client = await (await register(app.base)).json() as any;
    const page = await openLogin(app.base, client.client_id, pkce().challenge, { resource: "https://may-chu-khac.example/mcp" });
    assert.equal(page.res.status, 302);
    assert.equal(new URL(page.res.headers.get("location")!).searchParams.get("error"), "invalid_target");
  });

  it("mật khẩu không bị lưu trong cơ sở dữ liệu", async () => {
    await signIn(app.base);
    const dump = JSON.stringify(app.deps.db.prepare("SELECT * FROM erp_sessions").all()) + JSON.stringify(app.deps.db.prepare("SELECT * FROM audit").all());
    assert.ok(!dump.includes("dung-mat-khau"));
    assert.ok(!dump.includes(app.erp.access.keys().next().value!), "token ERP chỉ được lưu dạng mã hoá");
  });
});

describe("token", () => {
  it("PKCE sai → invalid_grant", async () => {
    const client = await (await register(app.base)).json() as any;
    const page = await openLogin(app.base, client.client_id, pkce().challenge);
    const code = new URL((await submitLogin(app.base, page, "ky.su@hawee.com.vn", "dung-mat-khau")).headers.get("location")!).searchParams.get("code")!;
    const res = await tokenRequest(app.base, { grant_type: "authorization_code", client_id: client.client_id, code, code_verifier: pkce().verifier, redirect_uri: REDIRECT });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "invalid_grant");
  });

  it("dùng lại authorization code → thu hồi toàn bộ phiên", async () => {
    const client = await (await register(app.base)).json() as any;
    const { verifier, challenge } = pkce();
    const page = await openLogin(app.base, client.client_id, challenge);
    const code = new URL((await submitLogin(app.base, page, "ky.su@hawee.com.vn", "dung-mat-khau")).headers.get("location")!).searchParams.get("code")!;
    const form = { grant_type: "authorization_code", client_id: client.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT };
    const first = await (await tokenRequest(app.base, form)).json() as any;
    assert.equal((await tokenRequest(app.base, form)).status, 400);
    const res = await fetch(`${app.base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${first.access_token}`, "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 401);
  });

  it("refresh xoay vòng; dùng lại refresh token cũ → thu hồi phiên", async () => {
    const t = await signIn(app.base);
    const next = await (await tokenRequest(app.base, { grant_type: "refresh_token", client_id: t.clientId, refresh_token: t.refresh_token })).json() as any;
    assert.ok(next.access_token && next.refresh_token !== t.refresh_token);
    const replay = await tokenRequest(app.base, { grant_type: "refresh_token", client_id: t.clientId, refresh_token: t.refresh_token });
    assert.equal(replay.status, 400);
    const after = await tokenRequest(app.base, { grant_type: "refresh_token", client_id: t.clientId, refresh_token: next.refresh_token });
    assert.equal(after.status, 400, "phiên đã bị thu hồi do phát hiện dùng lại");
  });

  it("refresh token của client khác → từ chối", async () => {
    const t = await signIn(app.base);
    const other = await (await register(app.base)).json() as any;
    const res = await tokenRequest(app.base, { grant_type: "refresh_token", client_id: other.client_id, refresh_token: t.refresh_token });
    assert.equal(res.status, 400);
  });

  it("thu hồi refresh token (gỡ kết nối) → access token cũng hết dùng được", async () => {
    const t = await signIn(app.base);
    const res = await fetch(`${app.base}/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: t.clientId, token: t.refresh_token }) });
    assert.equal(res.status, 200);
    const mcp = await fetch(`${app.base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${t.access_token}`, "content-type": "application/json" }, body: "{}" });
    assert.equal(mcp.status, 401);
  });
});

describe("phiên gắn với ERP", () => {
  it("ERP từ chối gia hạn (khoá tài khoản/đổi mật khẩu) → tool báo kết nối lại, refresh MCP bị từ chối", async () => {
    const local = await startApp();
    try {
      local.erp.accessTtl = 60; // token ERP gần hết hạn → lần gọi kế tiếp phải refresh
      const t = await signIn(local.base);
      local.erp.rejectRefresh = true;
      const client = await mcpClient(local.base, t.access_token);
      const result = await callTool(client, "tim_vat_tu", { tu_khoa: "Ống" });
      assert.ok(result.isError);
      assert.match(result.text, /kết nối lại/);
      const refresh = await tokenRequest(local.base, { grant_type: "refresh_token", client_id: t.clientId, refresh_token: t.refresh_token });
      assert.equal(refresh.status, 400);
      await client.close();
    } finally {
      await local.close();
    }
  });

  it("token ERP sắp hết hạn → tự refresh với ERP, lưu refresh token mới (xoay vòng)", async () => {
    const local = await startApp();
    try {
      local.erp.accessTtl = 60;
      const t = await signIn(local.base);
      const client = await mcpClient(local.base, t.access_token);
      assert.ok(!(await callTool(client, "tim_vat_tu", { tu_khoa: "Ống" })).isError);
      assert.ok(!(await callTool(client, "tim_vat_tu", { tu_khoa: "Tê" })).isError);
      const refreshes = local.erp.calls.filter(c => c === "POST /connect/token").length;
      assert.ok(refreshes >= 3, `đăng nhập + ít nhất 2 lần refresh (thực tế ${refreshes})`);
      await client.close();
    } finally {
      await local.close();
    }
  });
});
