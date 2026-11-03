// Phiên ERP của từng người dùng: lưu token ERP đã mã hoá, tự làm mới trước khi hết hạn,
// đọc lại quyền ERP mỗi lần làm mới. ERP từ chối làm mới → huỷ phiên và mọi token MCP gắn với nó.
import type { Config } from "../config.ts";
import { decrypt, encrypt, randomToken } from "../store/crypto.ts";
import { now, type Db } from "../store/db.ts";
import { log } from "../log.ts";
import { ErpAuthRejected, ErpUnavailable, identityFromToken, refreshGrant, type ErpTokens } from "./oidc.ts";
import { fetchGrantedPolicies } from "./policies.ts";

export type Session = {
  id: string;
  sub: string;
  username: string;
  email?: string;
  displayName?: string;
  role?: string;
  policies: string[];
};

type SessionRow = {
  id: string; sub: string; username: string; email: string | null; display_name: string | null; role: string | null;
  policies: string; erp_access_enc: string; erp_access_exp: number; erp_refresh_enc: string | null; revoked_at: number | null;
};

/** Phiên không còn dùng được: người dùng phải kết nối (đăng nhập) lại. */
export class SessionExpired extends Error {}

const REFRESH_MARGIN_SEC = 120;

export class SessionStore {
  private readonly refreshing = new Map<string, Promise<string>>();
  private readonly db: Db;
  private readonly config: Config;

  constructor(db: Db, config: Config) {
    this.db = db;
    this.config = config;
  }

  private aad(id: string, field: string): string {
    return `erp_sessions:${id}:${field}`;
  }

  async create(tokens: ErpTokens): Promise<Session> {
    const identity = identityFromToken(tokens.accessToken);
    const policies = await fetchGrantedPolicies(this.config, tokens.accessToken);
    const id = randomToken(18);
    const t = now();
    this.db.prepare(`INSERT INTO erp_sessions (id, sub, username, email, display_name, role, policies, erp_access_enc, erp_access_exp, erp_refresh_enc, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, identity.sub, identity.username, identity.email ?? null, identity.displayName ?? null, identity.role ?? null,
      JSON.stringify(policies),
      encrypt(this.config.encKey, tokens.accessToken, this.aad(id, "access")), tokens.expiresAt,
      tokens.refreshToken ? encrypt(this.config.encKey, tokens.refreshToken, this.aad(id, "refresh")) : null,
      t, t,
    );
    return { id, ...identity, policies };
  }

  private row(id: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM erp_sessions WHERE id = ?").get(id) as SessionRow | undefined;
  }

  get(id: string): Session | undefined {
    const row = this.row(id);
    if (!row || row.revoked_at) return undefined;
    return {
      id: row.id, sub: row.sub, username: row.username, email: row.email ?? undefined,
      displayName: row.display_name ?? undefined, role: row.role ?? undefined, policies: JSON.parse(row.policies),
    };
  }

  isActive(id: string): boolean {
    const row = this.db.prepare("SELECT revoked_at FROM erp_sessions WHERE id = ?").get(id) as { revoked_at: number | null } | undefined;
    return !!row && !row.revoked_at;
  }

  revoke(id: string, reason: string): void {
    const t = now();
    this.db.prepare("UPDATE erp_sessions SET revoked_at = ?, erp_access_enc = '', erp_refresh_enc = NULL WHERE id = ? AND revoked_at IS NULL").run(t, id);
    this.db.prepare("UPDATE tokens SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL").run(t, id);
    log.info("session.revoked", { session: id.slice(0, 8), reason });
  }

  /** Access token ERP còn hạn của phiên; tự làm mới (một lần cho mỗi phiên dù nhiều request đồng thời). */
  async accessToken(id: string): Promise<string> {
    const row = this.row(id);
    if (!row || row.revoked_at) throw new SessionExpired("Phiên đăng nhập ERP đã kết thúc");
    if (row.erp_access_exp - now() > REFRESH_MARGIN_SEC) return decrypt(this.config.encKey, row.erp_access_enc, this.aad(id, "access"));
    let pending = this.refreshing.get(id);
    if (!pending) {
      pending = this.refresh(row).finally(() => this.refreshing.delete(id));
      this.refreshing.set(id, pending);
    }
    return pending;
  }

  /** Bắt buộc làm mới ngay (vd ERP trả 401 dù token chưa hết hạn theo đồng hồ). */
  async forceRefresh(id: string): Promise<string> {
    const row = this.row(id);
    if (!row || row.revoked_at) throw new SessionExpired("Phiên đăng nhập ERP đã kết thúc");
    this.db.prepare("UPDATE erp_sessions SET erp_access_exp = 0 WHERE id = ?").run(id);
    return this.accessToken(id);
  }

  private async refresh(row: SessionRow): Promise<string> {
    if (!row.erp_refresh_enc) {
      this.revoke(row.id, "no_refresh_token");
      throw new SessionExpired("Phiên ERP hết hạn, cần đăng nhập lại");
    }
    const refreshToken = decrypt(this.config.encKey, row.erp_refresh_enc, this.aad(row.id, "refresh"));
    let tokens: ErpTokens;
    try {
      tokens = await refreshGrant(this.config, refreshToken);
    } catch (error) {
      if (error instanceof ErpAuthRejected) {
        this.revoke(row.id, "erp_refresh_rejected");
        throw new SessionExpired("ERP không gia hạn phiên (tài khoản bị khoá, đổi mật khẩu hoặc bị thu hồi). Cần đăng nhập lại.");
      }
      // ERP tạm không tới được: dùng tiếp token cũ nếu còn hạn.
      if (row.erp_access_exp > now()) return decrypt(this.config.encKey, row.erp_access_enc, this.aad(row.id, "access"));
      throw error;
    }
    let policies: string[] | undefined;
    try {
      policies = await fetchGrantedPolicies(this.config, tokens.accessToken);
    } catch (error) {
      if (!(error instanceof ErpUnavailable)) throw error;
      log.warn("session.policies_refresh_failed", { session: row.id.slice(0, 8) });
    }
    // OpenIddict xoay vòng refresh token: phải lưu token mới ngay.
    this.db.prepare(`UPDATE erp_sessions SET erp_access_enc = ?, erp_access_exp = ?, erp_refresh_enc = COALESCE(?, erp_refresh_enc),
      policies = COALESCE(?, policies), updated_at = ? WHERE id = ?`).run(
      encrypt(this.config.encKey, tokens.accessToken, this.aad(row.id, "access")), tokens.expiresAt,
      tokens.refreshToken ? encrypt(this.config.encKey, tokens.refreshToken, this.aad(row.id, "refresh")) : null,
      policies ? JSON.stringify(policies) : null, now(), row.id,
    );
    return tokens.accessToken;
  }
}
