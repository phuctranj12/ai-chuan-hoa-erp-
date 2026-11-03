// Thông báo lỗi OAuth để ASCII tiếng Anh: chúng đi vào header WWW-Authenticate / error_description (RFC 6749 chỉ cho ASCII).
// MCP đứng làm authorization server mặt tiền cho Claude/ChatGPT. Token phát ra là token CỦA MCP
// (chuỗi ngẫu nhiên, DB chỉ lưu băm); token ERP của người dùng nằm trên server, mã hoá, không bao giờ rời khỏi đây.
import type { Response } from "express";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidTargetError, InvalidTokenError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { Config } from "../config.ts";
import { randomToken, sha256 } from "../store/crypto.ts";
import { audit, now, type Db } from "../store/db.ts";
import { SessionExpired, type SessionStore } from "../erp/session.ts";
import { ErpUnavailable } from "../erp/oidc.ts";
import { log } from "../log.ts";
import { renderLoginPage } from "./pages.ts";

export const SCOPE = "vattu:read";
const PENDING_TTL_SEC = 600;
const CODE_TTL_SEC = 60;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

type TokenRow = { token_hash: string; kind: string; client_id: string; session_id: string; scopes: string; resource: string; expires_at: number; revoked_at: number | null };

export function redirectAllowed(config: Config, uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (config.allowedRedirectUris.includes("loopback") && url.protocol === "http:" && LOOPBACK.has(url.hostname)) return true;
  return config.allowedRedirectUris.includes(uri);
}

class ClientsStore implements OAuthRegisteredClientsStore {
  private readonly db: Db;
  private readonly config: Config;

  constructor(db: Db, config: Config) {
    this.db = db;
    this.config = config;
  }

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const row = this.db.prepare("SELECT data FROM clients WHERE client_id = ?").get(clientId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }

  registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">): OAuthClientInformationFull {
    const rejected = client.redirect_uris.filter(uri => !redirectAllowed(this.config, String(uri)));
    if (rejected.length) throw new InvalidClientMetadataError(`redirect_uri not allowed: ${rejected.join(", ")}`);
    if (client.grant_types && client.grant_types.some(type => type !== "authorization_code" && type !== "refresh_token")) {
      throw new InvalidClientMetadataError("Only authorization_code and refresh_token grants are supported");
    }
    const full: OAuthClientInformationFull = {
      ...client,
      client_name: client.client_name?.slice(0, 100),
      client_id: `vt_${randomToken(18)}`,
      client_id_issued_at: now(),
    };
    this.db.prepare("INSERT INTO clients (client_id, data, created_at) VALUES (?, ?, ?)").run(full.client_id, JSON.stringify(full), now());
    log.info("oauth.client_registered", { client: full.client_id, name: full.client_name, redirects: full.redirect_uris });
    return full;
  }
}

export class VattuOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: ClientsStore;
  private readonly db: Db;
  private readonly config: Config;
  private readonly sessions: SessionStore;

  constructor(db: Db, config: Config, sessions: SessionStore) {
    this.db = db;
    this.config = config;
    this.sessions = sessions;
    this.clientsStore = new ClientsStore(db, config);
  }

  private resourceFor(requested?: URL): string {
    const expected = this.config.resourceUrl.href;
    if (!requested) return expected;
    const normalize = (value: string) => value.replace(/#.*$/, "").replace(/\/$/, "");
    if (normalize(requested.href) !== normalize(expected)) throw new InvalidTargetError(`resource must be ${expected}`);
    return expected;
  }

  /** Hiện trang đăng nhập ERP. Cookie trình duyệt gắn yêu cầu với đúng trình duyệt đã mở nó. */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const resource = this.resourceFor(params.resource);
    const id = randomToken(18), csrf = randomToken(18), browser = randomToken(18);
    this.db.prepare(`INSERT INTO pending_auth (id, client_id, redirect_uri, code_challenge, state, scopes, resource, csrf, browser_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, client.client_id, params.redirectUri, params.codeChallenge, params.state ?? null, SCOPE, resource, csrf, sha256(browser), now() + PENDING_TTL_SEC,
    );
    res.cookie(authCookieName(this.config), browser, {
      httpOnly: true, sameSite: "lax", secure: this.config.publicBaseUrl.protocol === "https:", path: "/oauth/", maxAge: PENDING_TTL_SEC * 1000,
    });
    renderLoginPage(res, this.config, { pendingId: id, csrf, clientName: client.client_name, redirectUri: params.redirectUri });
  }

  /** Sau khi ERP chấp nhận đăng nhập: phát authorization code, trả về URL chuyển hướng cho client. */
  issueCode(pending: { client_id: string; redirect_uri: string; code_challenge: string; state: string | null; scopes: string; resource: string }, sessionId: string): string {
    const code = randomToken(32);
    this.db.prepare(`INSERT INTO auth_codes (code_hash, client_id, session_id, code_challenge, redirect_uri, resource, scopes, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(sha256(code), pending.client_id, sessionId, pending.code_challenge, pending.redirect_uri, pending.resource, pending.scopes, now() + CODE_TTL_SEC);
    const target = new URL(pending.redirect_uri);
    target.searchParams.set("code", code);
    if (pending.state) target.searchParams.set("state", pending.state);
    return target.href;
  }

  private codeRow(client: OAuthClientInformationFull, code: string) {
    const row = this.db.prepare("SELECT * FROM auth_codes WHERE code_hash = ?").get(sha256(code)) as
      { code_hash: string; client_id: string; session_id: string; code_challenge: string; redirect_uri: string; resource: string; scopes: string; expires_at: number; used_at: number | null } | undefined;
    if (!row || row.client_id !== client.client_id) throw new InvalidGrantError("Invalid authorization code");
    return row;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return this.codeRow(client, authorizationCode).code_challenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _verifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    const row = this.codeRow(client, authorizationCode);
    if (row.used_at) {
      // Code bị dùng lại = có thể đã lộ: thu hồi mọi token sinh từ phiên đó (OAuth 2.1 §4.1.3).
      this.sessions.revoke(row.session_id, "auth_code_replay");
      throw new InvalidGrantError("Authorization code already used");
    }
    if (row.expires_at < now()) throw new InvalidGrantError("Authorization code expired");
    if (redirectUri !== undefined && redirectUri !== row.redirect_uri) throw new InvalidGrantError("redirect_uri mismatch");
    if (resource && this.resourceFor(resource) !== row.resource) throw new InvalidTargetError("resource mismatch");
    const used = this.db.prepare("UPDATE auth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL").run(now(), row.code_hash);
    if (used.changes !== 1) throw new InvalidGrantError("Authorization code already used");
    if (!this.sessions.isActive(row.session_id)) throw new InvalidGrantError("ERP session has ended, sign in again");
    return this.issueTokens(client.client_id, row.session_id, row.resource);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, _scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    const row = this.db.prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'refresh'").get(sha256(refreshToken)) as TokenRow | undefined;
    if (!row || row.client_id !== client.client_id) throw new InvalidGrantError("Invalid refresh token");
    if (row.revoked_at) {
      // Refresh token đã xoay vòng mà vẫn bị dùng lại = dấu hiệu bị đánh cắp → huỷ cả phiên.
      this.sessions.revoke(row.session_id, "refresh_token_replay");
      throw new InvalidGrantError("Refresh token revoked");
    }
    if (row.expires_at < now()) throw new InvalidGrantError("Refresh token expired");
    if (resource && this.resourceFor(resource) !== row.resource) throw new InvalidTargetError("resource mismatch");
    // Gắn tuổi thọ phiên MCP với ERP: ERP không gia hạn được thì người dùng phải đăng nhập lại.
    try {
      await this.sessions.accessToken(row.session_id);
    } catch (error) {
      if (error instanceof SessionExpired) throw new InvalidGrantError("ERP session could not be renewed, sign in again");
      if (error instanceof ErpUnavailable) throw new ServerError("ERP is temporarily unavailable, retry later");
      throw error;
    }
    this.db.prepare("UPDATE tokens SET revoked_at = ? WHERE token_hash = ?").run(now(), row.token_hash);
    return this.issueTokens(client.client_id, row.session_id, row.resource);
  }

  private issueTokens(clientId: string, sessionId: string, resource: string): OAuthTokens {
    const access = randomToken(32), refresh = randomToken(32), t = now();
    const insert = this.db.prepare(`INSERT INTO tokens (token_hash, kind, client_id, session_id, scopes, resource, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insert.run(sha256(access), "access", clientId, sessionId, SCOPE, resource, t + this.config.accessTokenTtlSec, t);
    insert.run(sha256(refresh), "refresh", clientId, sessionId, SCOPE, resource, t + this.config.refreshTokenTtlSec, t);
    return { access_token: access, token_type: "bearer", expires_in: this.config.accessTokenTtlSec, refresh_token: refresh, scope: SCOPE };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = this.db.prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'access'").get(sha256(token)) as TokenRow | undefined;
    if (!row || row.revoked_at || row.expires_at < now() || !this.sessions.isActive(row.session_id)) {
      throw new InvalidTokenError("Invalid or expired token");
    }
    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes.split(" "),
      expiresAt: row.expires_at,
      resource: new URL(row.resource),
      extra: { sessionId: row.session_id },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const row = this.db.prepare("SELECT * FROM tokens WHERE token_hash = ?").get(sha256(request.token)) as TokenRow | undefined;
    if (!row || row.client_id !== client.client_id) return;
    if (row.kind === "refresh") {
      // Gỡ kết nối: thu hồi mọi token của client này trên phiên đó.
      this.db.prepare("UPDATE tokens SET revoked_at = ? WHERE session_id = ? AND client_id = ? AND revoked_at IS NULL").run(now(), row.session_id, row.client_id);
    } else {
      this.db.prepare("UPDATE tokens SET revoked_at = ? WHERE token_hash = ?").run(now(), row.token_hash);
    }
    audit(this.db, { sessionId: row.session_id, clientId: client.client_id, action: "oauth.revoke", detail: { kind: row.kind }, ok: true });
  }
}

export function authCookieName(config: Config): string {
  // Tiền tố __Secure- buộc trình duyệt chỉ nhận cookie qua HTTPS; khi chạy http (dev/test) dùng tên thường.
  return config.publicBaseUrl.protocol === "https:" ? "__Secure-vt_auth" : "vt_auth";
}
