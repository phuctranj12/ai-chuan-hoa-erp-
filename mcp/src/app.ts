// Ghép các phần HTTP: OAuth (metadata, DCR, authorize, token, revoke), form đăng nhập ERP, /mcp, tải file.
import { createReadStream } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import { createOAuthMetadata, getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loginRouter } from "./oauth/login.ts";
import { SCOPE, VattuOAuthProvider } from "./oauth/provider.ts";
import { buildServer, type ToolDeps } from "./tools.ts";
import { errorMessage, log } from "./log.ts";

const RESOURCE_NAME = "AI Chuẩn hóa vật tư ERP Hawee";

export function createApp(deps: ToolDeps): express.Express {
  const { config, db, sessions, files } = deps;
  const provider = new VattuOAuthProvider(db, config, sessions);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use((req, res, next) => {
    const started = Date.now();
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.on("finish", () => {
      // Không log query string: /authorize mang state, code_challenge; /files mang link bí mật.
      const path = req.originalUrl.split("?")[0].replace(/^\/files\/.*/, "/files/:token");
      log.info("http", { method: req.method, path, status: res.statusCode, ms: Date.now() - started, ip: req.ip });
    });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, version: config.version });
  });

  if (config.allowedHosts.length) app.use(hostHeaderValidation(config.allowedHosts));

  const oauthMetadata = createOAuthMetadata({ provider, issuerUrl: config.publicBaseUrl, scopesSupported: [SCOPE] });
  const protectedResource = {
    resource: config.resourceUrl.href,
    authorization_servers: [oauthMetadata.issuer],
    scopes_supported: [SCOPE],
    resource_name: RESOURCE_NAME,
  };
  app.use(mcpAuthRouter({
    provider,
    issuerUrl: config.publicBaseUrl,
    resourceServerUrl: config.resourceUrl,
    scopesSupported: [SCOPE],
    resourceName: RESOURCE_NAME,
    // Client public (PKCE) không có secret; client có secret thì secret không hết hạn giữa chừng phiên.
    clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
  }));
  // Một số client dò metadata ở đường dẫn gốc hoặc kèm hậu tố /mcp — trả cùng nội dung.
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json(protectedResource);
  });
  app.get(["/.well-known/oauth-authorization-server/mcp", "/.well-known/openid-configuration"], (_req, res) => {
    res.json(oauthMetadata);
  });

  app.use(loginRouter(db, config, provider, sessions));

  app.get("/files/:token", (req, res) => {
    const file = files.lookup(String(req.params.token));
    if (!file) {
      res.status(404).type("text/plain; charset=utf-8").send("Link tải không tồn tại hoặc đã hết hạn.");
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="ket-qua.xlsx"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    createReadStream(file.path).on("error", () => res.destroy()).pipe(res);
  });

  const bearer = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(config.resourceUrl),
    expectedResource: config.resourceUrl,
  });
  // Stateless: mỗi request một McpServer + transport; không giữ phiên MCP trong RAM → chạy được nhiều bản sao.
  app.post("/mcp", bearer, express.json({ limit: "4mb" }), async (req: Request, res: Response) => {
    const server = buildServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log.error("mcp.request_failed", { error: errorMessage(error) });
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  app.all("/mcp", bearer, (_req, res) => {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error("http.unhandled", { error: errorMessage(error) });
    if (!res.headersSent) res.status(500).json({ error: "server_error" });
  });
  return app;
}
