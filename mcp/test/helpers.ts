// ERP giả lập (token endpoint OpenIddict, application-configuration, BIM) + tiện ích dựng app để test
// toàn bộ luồng OAuth và tool mà không cần ERP thật hay tài khoản thật.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createDeps } from "../src/index.ts";
import type { ToolDeps } from "../src/tools.ts";

process.env.VT_LOG_LEVEL ??= "error";

export const ALL_POLICIES = [
  "Company.Material.Discipline.Read", "Company.Material.Group.Read", "Company.Material.Item.Read", "Company.Material.Size.Read",
  "Company.Material.SpecRange.Read", "Company.Material.Standard.Read", "Company.Material.Finishing.Read",
  "Company.Material.InstallationType.Read", "Company.Material.Origin.Read", "Company.Material.InstallationSpace.Read",
  "Company.Material.CodeRule.Read",
];

type FakeUser = { password: string; sub: string; code: string; policies: string[] };

export class FakeErp {
  readonly users = new Map<string, FakeUser>([
    ["ky.su@hawee.com.vn", { password: "dung-mat-khau", sub: "11111111-1111-1111-1111-111111111111", code: "05923", policies: ALL_POLICIES }],
    ["han.che@hawee.com.vn", { password: "dung-mat-khau", sub: "22222222-2222-2222-2222-222222222222", code: "07777", policies: ["Company.Material.Group.Read", "Company.Material.Item.Read"] }],
  ]);
  /** access token → người dùng */
  readonly access = new Map<string, string>();
  /** refresh token → người dùng (xoá khi đã dùng: xoay vòng) */
  readonly refresh = new Map<string, string>();
  readonly calls: string[] = [];
  /** Đặt true để mọi refresh bị từ chối (mô phỏng admin khoá tài khoản / đổi mật khẩu). */
  rejectRefresh = false;
  accessTtl = 3600;
  base = "";
  private server?: Server;

  private jwt(user: FakeUser, email: string): string {
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    return `${b64({ alg: "RS256", typ: "at+jwt" })}.${b64({
      iss: "https://cm-api.test/", aud: "CxmApi", sub: user.sub, preferred_username: user.code, email,
      role: "DA-Kỹ sư thiết kế", given_name: "Phúc", family_name: "Trần", iat: now, exp: now + this.accessTtl, jti: randomBytes(8).toString("hex"),
    })}.${randomBytes(16).toString("base64url")}`;
  }

  private issue(email: string) {
    const user = this.users.get(email)!;
    const accessToken = this.jwt(user, email), refreshToken = randomBytes(24).toString("base64url");
    this.access.set(accessToken, email);
    this.refresh.set(refreshToken, email);
    return { access_token: accessToken, token_type: "Bearer", expires_in: this.accessTtl, refresh_token: refreshToken };
  }

  private userOf(req: IncomingMessage): FakeUser | undefined {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const email = this.access.get(token);
    return email ? this.users.get(email) : undefined;
  }

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      const url = new URL(req.url!, "http://x");
      this.calls.push(`${req.method} ${url.pathname}`);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.method === "POST" && url.pathname === "/connect/token") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const form = new URLSearchParams(raw);
        if (form.get("client_id") !== "CxmApi_App") return json(400, { error: "invalid_client" });
        if (form.get("grant_type") === "password") {
          const user = this.users.get(form.get("username") ?? "");
          if (!user || user.password !== form.get("password")) return json(400, { error: "invalid_grant", error_description: "The username/password couple is invalid." });
          return json(200, this.issue(form.get("username")!));
        }
        if (form.get("grant_type") === "refresh_token") {
          const email = this.refresh.get(form.get("refresh_token") ?? "");
          if (!email || this.rejectRefresh) return json(400, { error: "invalid_grant" });
          this.refresh.delete(form.get("refresh_token")!);
          return json(200, this.issue(email));
        }
        return json(400, { error: "unsupported_grant_type" });
      }
      if (url.pathname === "/.well-known/openid-configuration") return json(200, { issuer: "https://cm-api.test/" });
      const user = this.userOf(req);
      if (!user) {
        res.writeHead(401, { "www-authenticate": "Bearer" });
        return res.end();
      }
      if (url.pathname === "/api/abp/application-configuration") {
        return json(200, { auth: { grantedPolicies: Object.fromEntries([...user.policies, "Project.Warehouse.Read"].map(p => [p, true])) } });
      }
      return this.bim(url, json);
    });
    await new Promise<void>(done => this.server!.listen(0, "127.0.0.1", done));
    this.base = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  private bim(url: URL, json: (status: number, body: unknown) => void): void {
    const keyword = (url.searchParams.get("Keyword") ?? "").toLowerCase();
    const groupFilter = url.searchParams.get("Filters[itemGroupCode__eq]");
    const groups = [
      { id: 10072, name: "Ống uPVC & phụ kiện", code: "PUP", isActive: 1 },
      { id: 10017, name: "Ống luồn dây PVC & phụ kiện", code: "EPV", isActive: 1 },
    ];
    const items = [
      { id: 1, name: "Ống uPVC", code: "PUP101", itemGroupName: "Ống uPVC & phụ kiện", itemGroupCode: "PUP", unitName: "m", isActive: 1 },
      { id: 2, name: "Tê thu uPVC", code: "PUP007", itemGroupName: "Ống uPVC & phụ kiện", itemGroupCode: "PUP", unitName: "Cái", isActive: 1 },
      { id: 3, name: "Ống luồn dây PVC", code: "EPV001", itemGroupName: "Ống luồn dây PVC & phụ kiện", itemGroupCode: "EPV", unitName: "m", isActive: 1 },
    ];
    const link = (code: string, name: string) => ({ itemGroupCode: code, itemGroupName: name, isActive: 1 });
    const lists: Record<string, object[]> = {
      Size: [
        { id: 1, name: "110", description: "D110", isActive: 1, itemGroupSizes: [link("PUP", "Ống uPVC & phụ kiện")] },
        { id: 2, name: "90", description: "D90", isActive: 1, itemGroupSizes: [link("PUP", "Ống uPVC & phụ kiện")] },
        { id: 3, name: "60", description: "D60", isActive: 1, itemGroupSizes: [link("PUP", "Ống uPVC & phụ kiện")] },
        { id: 4, name: "20", description: "DN20", isActive: 1, itemGroupSizes: [link("EPV", "Ống luồn dây PVC & phụ kiện")] },
      ],
      Range: [{ id: 1, name: "PN10", description: "PN10", isActive: 1, itemGroupRanges: [link("PUP", "Ống uPVC & phụ kiện")] }],
      Specification: [{ id: 1, name: "ISO 1452", description: "Hệ ống uPVC", isActive: 1 }],
      Finish: [{ id: 1, name: "màu trắng", code: "CLR.WHT", isActive: 1 }, { id: 2, name: "màu bạc", code: "CLR.SLV", isActive: 0 }],
      InstallType: [], Origin: [], InstallationSpace: [],
    };
    const path = url.pathname;
    if (path === "/api/ItemGroup/list") return json(200, { items: groups, totalCount: groups.length });
    if (path === "/api/Item/list") {
      const found = items.filter(i => (!groupFilter || i.itemGroupCode === groupFilter) && (!keyword || i.name.toLowerCase().includes(keyword) || i.code.toLowerCase().includes(keyword)));
      return json(200, { items: found, totalCount: found.length });
    }
    if (path === "/CodeGenConditionField/items-in-group") {
      const code = url.searchParams.get("itemGroupCode");
      const matrix: Record<string, Record<string, string[]>> = {
        PUP: { "Ống uPVC": ["itemgroup", "item", "size", "range", "specification", "packagingitem", "unit", "manufacture", "origin"], "Tê thu uPVC": ["itemgroup", "item", "size", "range", "specification", "unit", "manufacture", "origin"] },
        EPV: { "Ống luồn dây PVC": ["itemgroup", "item", "size", "finish", "packagingitem", "unit", "manufacture", "origin", "model"] },
      };
      const group = groups.find(g => g.code === code);
      if (!group || !matrix[code!]) return json(204, null);
      return json(200, {
        itemGroupId: group.id, itemGroupCode: group.code, itemGroupName: group.name, configStatus: [],
        items: Object.entries(matrix[code!]).map(([itemName, fields]) => {
          const item = items.find(i => i.name === itemName)!;
          return { itemName, itemCode: item.code, itemId: item.id, fields, isExisting: true, isActive: 1 };
        }),
      });
    }
    const listMatch = /^\/api\/(\w+)\/list$/.exec(path);
    if (listMatch && lists[listMatch[1]]) {
      const found = (lists[listMatch[1]] as { name?: string; description?: string; code?: string }[])
        .filter(v => !keyword || [v.name, v.description, v.code].some(t => t?.toLowerCase().includes(keyword)));
      return json(200, { items: found, totalCount: found.length });
    }
    json(404, { error: "not found" });
  }

  async stop(): Promise<void> {
    await new Promise<void>(done => this.server?.close(() => done()) ?? done());
  }
}

export type TestApp = { base: string; deps: ToolDeps; erp: FakeErp; close: () => Promise<void> };

export const SKILL_DIR = resolve(import.meta.dirname, "../../plugin/skills/ai-chuan-hoa-vat-tu-erp");

export async function startApp(env: Record<string, string> = {}): Promise<TestApp> {
  const erp = new FakeErp();
  await erp.start();
  const dataDir = mkdtempSync(join(tmpdir(), "vt-test-"));
  const server = createServer();
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as AddressInfo).port;
  const settings: Record<string, string> = {
    VT_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
    VT_DATA_DIR: dataDir,
    VT_SKILL_DIR: SKILL_DIR,
    VT_ENC_KEY: randomBytes(32).toString("base64"),
    VT_ERP_TOKEN_URL: `${erp.base}/connect/token`,
    VT_ERP_API_BASE: erp.base,
    VT_ERP_BIM_BASE: erp.base,
    VT_LOGIN_RATE_PER_MIN: "1000",
    ...env,
  };
  const saved = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const config = loadConfig();
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  const deps = await createDeps(config);
  server.on("request", createApp(deps));
  return {
    base: `http://127.0.0.1:${port}`,
    deps,
    erp,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>(done => server.close(() => done()));
      await erp.stop();
      deps.db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export const REDIRECT = "http://127.0.0.1:53682/callback";

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export async function register(base: string, redirectUris = [REDIRECT]): Promise<Response> {
  return fetch(`${base}/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "test", redirect_uris: redirectUris, token_endpoint_auth_method: "none" }),
  });
}

export async function openLogin(base: string, clientId: string, challenge: string, extra: Record<string, string> = {}) {
  const url = new URL(`${base}/authorize`);
  const params = { client_id: clientId, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "st", ...extra };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { redirect: "manual" });
  const html = await res.text();
  return {
    res, html,
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0],
    pending: /name="pending" value="([^"]+)"/.exec(html)?.[1] ?? "",
    csrf: /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? "",
  };
}

export async function submitLogin(base: string, page: { cookie: string; pending: string; csrf: string }, username: string, password: string): Promise<Response> {
  return fetch(`${base}/oauth/login`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: page.cookie },
    body: new URLSearchParams({ pending: page.pending, csrf: page.csrf, username, password }),
  });
}

export async function tokenRequest(base: string, form: Record<string, string>): Promise<Response> {
  return fetch(`${base}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
}

/** Chạy trọn luồng: DCR → authorize → đăng nhập → code → token. */
export async function signIn(base: string, username = "ky.su@hawee.com.vn", password = "dung-mat-khau") {
  const client = await (await register(base)).json() as { client_id: string };
  const { verifier, challenge } = pkce();
  const page = await openLogin(base, client.client_id, challenge);
  const login = await submitLogin(base, page, username, password);
  const code = new URL(login.headers.get("location")!).searchParams.get("code")!;
  const tokens = await (await tokenRequest(base, { grant_type: "authorization_code", client_id: client.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT })).json() as
    { access_token: string; refresh_token: string; expires_in: number };
  return { clientId: client.client_id, ...tokens };
}

export async function mcpClient(base: string, accessToken: string): Promise<Client> {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${accessToken}` } } }));
  return client;
}

export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { text: string }[])[0]?.text ?? "";
  return { isError: Boolean(result.isError), text, data: result.structuredContent as Record<string, any> };
}
