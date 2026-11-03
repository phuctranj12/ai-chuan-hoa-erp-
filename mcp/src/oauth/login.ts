// POST /oauth/login: nhận tài khoản/mật khẩu từ form, chuyển thẳng tới ERP (password grant),
// tạo phiên ERP + authorization code rồi chuyển hướng về Claude/ChatGPT. Mật khẩu không lưu, không log.
import express, { type Request, type Response, type Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Config } from "../config.ts";
import { safeEqual, sha256 } from "../store/crypto.ts";
import { audit, now, type Db } from "../store/db.ts";
import { ErpAuthRejected, ErpUnavailable, passwordGrant } from "../erp/oidc.ts";
import type { SessionStore } from "../erp/session.ts";
import { errorMessage, log } from "../log.ts";
import { authCookieName, type VattuOAuthProvider } from "./provider.ts";
import { renderLoginPage, renderMessage } from "./pages.ts";

type PendingRow = {
  id: string; client_id: string; redirect_uri: string; code_challenge: string; state: string | null;
  scopes: string; resource: string; csrf: string; browser_hash: string; expires_at: number;
};

/** Chặn dò mật khẩu theo tài khoản (ngoài giới hạn theo IP và cơ chế khoá tài khoản của chính ERP). */
class FailureLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowSec: number;
  constructor(max: number, windowSec: number) {
    this.max = max;
    this.windowSec = windowSec;
  }
  private recent(key: string): number[] {
    const cutoff = now() - this.windowSec;
    const list = (this.failures.get(key) ?? []).filter(t => t > cutoff);
    if (list.length) this.failures.set(key, list); else this.failures.delete(key);
    return list;
  }
  blocked(key: string): boolean {
    return this.recent(key).length >= this.max;
  }
  fail(key: string): void {
    this.failures.set(key, [...this.recent(key), now()]);
    if (this.failures.size > 10000) this.failures.delete(this.failures.keys().next().value as string);
  }
  clear(key: string): void {
    this.failures.delete(key);
  }
}

export function loginRouter(db: Db, config: Config, provider: VattuOAuthProvider, sessions: SessionStore): Router {
  const router = express.Router();
  const perAccount = new FailureLimiter(5, 15 * 60);
  router.use("/oauth/login", rateLimit({ windowMs: 60 * 1000, limit: config.loginRatePerMinute, standardHeaders: true, legacyHeaders: false }));
  router.post("/oauth/login", express.urlencoded({ extended: false, limit: "8kb" }), async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const field = (name: string, max: number) => typeof body[name] === "string" ? (body[name] as string).slice(0, max) : "";
    const pendingId = field("pending", 64), csrf = field("csrf", 64);
    const username = field("username", 200).trim(), password = field("password", 500);

    const pending = db.prepare("SELECT * FROM pending_auth WHERE id = ?").get(pendingId) as PendingRow | undefined;
    const browser = parseCookie(req.headers.cookie, authCookieName(config)) ?? "";
    if (!pending || pending.expires_at < now() || !safeEqual(pending.csrf, csrf) || !browser || !safeEqual(pending.browser_hash, sha256(browser))) {
      renderMessage(res, "Phiên đăng nhập đã hết hạn", "Hãy quay lại Claude/ChatGPT và bấm kết nối lại.", 400);
      return;
    }
    const client = provider.clientsStore.getClient(pending.client_id);
    const again = (error: string, status: number) => renderLoginPage(res, config,
      { pendingId: pending.id, csrf: pending.csrf, clientName: client?.client_name, redirectUri: pending.redirect_uri, error, username }, status);

    if (!username || !password) {
      again("Nhập đủ tên đăng nhập và mật khẩu.", 400);
      return;
    }
    const accountKey = username.toLowerCase();
    if (perAccount.blocked(accountKey)) {
      again("Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.", 429);
      return;
    }

    try {
      const tokens = await passwordGrant(config, username, password);
      const session = await sessions.create(tokens);
      perAccount.clear(accountKey);
      db.prepare("DELETE FROM pending_auth WHERE id = ?").run(pending.id);
      res.clearCookie(authCookieName(config), { path: "/oauth/" });
      const redirect = provider.issueCode(pending, session.id);
      audit(db, { sessionId: session.id, username: session.username, clientId: pending.client_id, action: "oauth.login", ok: true });
      log.info("oauth.login", { user: session.username, client: pending.client_id, policies: session.policies.length });
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, redirect);
    } catch (error) {
      if (error instanceof ErpAuthRejected) {
        perAccount.fail(accountKey);
        audit(db, { username, clientId: pending.client_id, action: "oauth.login", detail: { reason: "rejected" }, ok: false });
        again("ERP từ chối đăng nhập: sai tài khoản/mật khẩu, hoặc tài khoản bị khoá.", 401);
        return;
      }
      log.error("oauth.login_failed", { error: errorMessage(error) });
      audit(db, { username, clientId: pending.client_id, action: "oauth.login", detail: { reason: "erp_unavailable" }, ok: false });
      again(error instanceof ErpUnavailable ? "Không kết nối được ERP. Thử lại sau ít phút." : "Lỗi hệ thống khi đăng nhập. Thử lại sau.", 502);
    }
  });
  return router;
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}
