// Đăng nhập ERP (OpenIddict tại cm-api) bằng tài khoản của chính người dùng.
// Mật khẩu chỉ đi qua hàm passwordGrant() một lần, không lưu, không log.
import type { Config } from "../config.ts";

export type ErpTokens = {
  accessToken: string;
  refreshToken?: string;
  /** epoch giây */
  expiresAt: number;
};

export type ErpIdentity = {
  sub: string;
  username: string;
  email?: string;
  displayName?: string;
  role?: string;
};

/** ERP từ chối thông tin đăng nhập / refresh token (sai mật khẩu, bị khoá, token bị thu hồi). */
export class ErpAuthRejected extends Error {}
/** Không gọi được ERP (mạng, 5xx, timeout). */
export class ErpUnavailable extends Error {}

async function tokenRequest(config: Config, form: Record<string, string>): Promise<ErpTokens> {
  let response: Response;
  try {
    response = await fetch(config.erp.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: config.erp.clientId, ...form }),
      signal: AbortSignal.timeout(config.erp.timeoutMs),
    });
  } catch (error) {
    throw new ErpUnavailable(`Không kết nối được máy chủ đăng nhập ERP: ${(error as Error).message}`);
  }
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    // invalid_grant = sai tài khoản/mật khẩu, tài khoản khoá, refresh token hết hiệu lực.
    throw new ErpAuthRejected(String(body.error || `HTTP ${response.status}`));
  }
  if (!response.ok || typeof body.access_token !== "string") {
    throw new ErpUnavailable(`Máy chủ đăng nhập ERP trả lỗi HTTP ${response.status}`);
  }
  const expiresIn = Number(body.expires_in) || 3600;
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
  };
}

export function passwordGrant(config: Config, username: string, password: string): Promise<ErpTokens> {
  return tokenRequest(config, { grant_type: "password", scope: config.erp.scope, username, password });
}

export function refreshGrant(config: Config, refreshToken: string): Promise<ErpTokens> {
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/**
 * Đọc claim từ access token ERP. Không verify chữ ký: token vừa nhận trực tiếp từ token endpoint
 * của ERP qua HTTPS, và mọi API ERP vẫn tự verify khi MCP gọi bằng token này.
 */
export function identityFromToken(accessToken: string): ErpIdentity {
  const payload = accessToken.split(".")[1];
  if (!payload) throw new ErpUnavailable("Access token ERP không đúng định dạng JWT");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  const text = (value: unknown) => typeof value === "string" && value ? value : undefined;
  const role = Array.isArray(claims.role) ? claims.role.join(", ") : text(claims.role);
  const sub = text(claims.sub);
  if (!sub) throw new ErpUnavailable("Access token ERP thiếu claim sub");
  const name = [text(claims.family_name), text(claims.given_name)].filter(Boolean).join(" ");
  return {
    sub,
    username: text(claims.preferred_username) || text(claims.unique_name) || sub,
    email: text(claims.email),
    displayName: name || undefined,
    role,
  };
}
