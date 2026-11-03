// Cấu hình đọc từ biến môi trường (tiền tố VT_). Xem deploy/.env.example để biết ý nghĩa từng biến.
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { log } from "./log.ts";

export type Config = {
  version: string;
  production: boolean;
  host: string;
  port: number;
  /** URL công khai của chính MCP (issuer OAuth), vd https://vattu.hawee.com.vn */
  publicBaseUrl: URL;
  /** URL tài nguyên MCP (RFC 8707) = publicBaseUrl + /mcp */
  resourceUrl: URL;
  /** Số proxy tin cậy đứng trước app (nginx = 1) — để express lấy đúng IP client. */
  trustProxy: number;
  /** Hostname được phép gọi (chống DNS rebinding). Rỗng = không kiểm. */
  allowedHosts: string[];
  dataDir: string;
  skillDir: string;
  encKey: Buffer;
  erp: {
    tokenUrl: string;
    apiBase: string;
    bimBase: string;
    clientId: string;
    scope: string;
    timeoutMs: number;
  };
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  /** redirect_uri được phép đăng ký qua DCR. Phần tử "loopback" = mọi http://localhost|127.0.0.1 (RFC 8252). */
  allowedRedirectUris: string[];
  /** Số dòng tối đa được đối chiếu ERP trực tiếp trong một lần chuẩn hoá. */
  liveVerifyMaxRows: number;
  fileTtlSec: number;
  /** Số lần POST form đăng nhập tối đa mỗi phút cho một IP. */
  loginRatePerMinute: number;
};

const DEFAULT_REDIRECTS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
  "https://chatgpt.com/connector_platform_oauth_redirect",
  "loopback",
];

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} phải là số nguyên không âm`);
  return value;
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.split(",").map(item => item.trim()).filter(Boolean);
}

function encryptionKey(production: boolean): Buffer {
  const raw = process.env.VT_ENC_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("VT_ENC_KEY phải là 32 byte mã base64 (openssl rand -base64 32)");
    return key;
  }
  if (production) throw new Error("Thiếu VT_ENC_KEY: bắt buộc khi NODE_ENV=production");
  log.warn("config", { msg: "VT_ENC_KEY chưa đặt — dùng khoá tạm, mọi phiên đăng nhập mất khi khởi động lại" });
  return randomBytes(32);
}

export function loadConfig(): Config {
  const production = process.env.NODE_ENV === "production";
  const port = int("VT_PORT", 8080);
  const base = new URL(process.env.VT_PUBLIC_BASE_URL || `http://localhost:${port}`);
  if (base.pathname !== "/" || base.search || base.hash) throw new Error("VT_PUBLIC_BASE_URL chỉ gồm scheme + host (+ cổng), không có đường dẫn");
  if (production && base.protocol !== "https:") throw new Error("VT_PUBLIC_BASE_URL phải là https:// khi chạy production");
  const resourceUrl = new URL("/mcp", base);
  return {
    version: process.env.APP_VERSION || "dev",
    production,
    host: process.env.VT_HOST || "0.0.0.0",
    port,
    publicBaseUrl: base,
    resourceUrl,
    trustProxy: int("VT_TRUST_PROXY", 1),
    allowedHosts: list("VT_ALLOWED_HOSTS", production ? [base.hostname] : []),
    dataDir: resolve(process.env.VT_DATA_DIR || "./data"),
    skillDir: resolve(process.env.VT_SKILL_DIR || "../plugin/skills/ai-chuan-hoa-vat-tu-erp"),
    encKey: encryptionKey(production),
    erp: {
      tokenUrl: process.env.VT_ERP_TOKEN_URL || "https://cm-api.erp.hawee.com.vn/connect/token",
      apiBase: (process.env.VT_ERP_API_BASE || "https://cm-api.erp.hawee.com.vn").replace(/\/$/, ""),
      bimBase: (process.env.VT_ERP_BIM_BASE || "https://bim.erp.hawee.com.vn").replace(/\/$/, ""),
      clientId: process.env.VT_ERP_CLIENT_ID || "CxmApi_App",
      scope: process.env.VT_ERP_SCOPE || "openid profile email roles offline_access CxmApi",
      timeoutMs: int("VT_ERP_TIMEOUT_MS", 20000),
    },
    accessTokenTtlSec: int("VT_ACCESS_TOKEN_TTL", 3600),
    refreshTokenTtlSec: int("VT_REFRESH_TOKEN_TTL", 30 * 24 * 3600),
    allowedRedirectUris: list("VT_ALLOWED_REDIRECT_URIS", DEFAULT_REDIRECTS),
    liveVerifyMaxRows: int("VT_LIVE_VERIFY_MAX_ROWS", 50),
    fileTtlSec: int("VT_FILE_TTL", 3600),
    loginRatePerMinute: int("VT_LOGIN_RATE_PER_MIN", 10),
  };
}
