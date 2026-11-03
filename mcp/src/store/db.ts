// SQLite (node:sqlite, không cần thư viện native). Một file trong VT_DATA_DIR, sống qua mỗi lần deploy.
// Schema tự tạo khi khởi động (CREATE TABLE IF NOT EXISTS) — không có bước migration riêng.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Client OAuth do Claude/ChatGPT tự đăng ký (DCR).
CREATE TABLE IF NOT EXISTS clients (
  client_id   TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Yêu cầu /authorize đang chờ người dùng đăng nhập (sống 10 phút).
CREATE TABLE IF NOT EXISTS pending_auth (
  id             TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  state          TEXT,
  scopes         TEXT NOT NULL,
  resource       TEXT NOT NULL,
  csrf           TEXT NOT NULL,
  browser_hash   TEXT NOT NULL,
  expires_at     INTEGER NOT NULL
);

-- Phiên ERP của một người dùng: token ERP mã hoá + quyền ERP (grantedPolicies).
CREATE TABLE IF NOT EXISTS erp_sessions (
  id              TEXT PRIMARY KEY,
  sub             TEXT NOT NULL,
  username        TEXT NOT NULL,
  email           TEXT,
  display_name    TEXT,
  role            TEXT,
  policies        TEXT NOT NULL,
  erp_access_enc  TEXT NOT NULL,
  erp_access_exp  INTEGER NOT NULL,
  erp_refresh_enc TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  revoked_at      INTEGER
);
CREATE INDEX IF NOT EXISTS erp_sessions_sub ON erp_sessions(sub);

-- Mã authorization_code (chỉ lưu băm, dùng một lần, sống 60 giây).
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  session_id     TEXT NOT NULL REFERENCES erp_sessions(id) ON DELETE CASCADE,
  code_challenge TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  resource       TEXT NOT NULL,
  scopes         TEXT NOT NULL,
  expires_at     INTEGER NOT NULL,
  used_at        INTEGER
);

-- Token MCP phát cho Claude/ChatGPT (chỉ lưu băm).
CREATE TABLE IF NOT EXISTS tokens (
  token_hash  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('access','refresh')),
  client_id   TEXT NOT NULL,
  session_id  TEXT NOT NULL REFERENCES erp_sessions(id) ON DELETE CASCADE,
  scopes      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  revoked_at  INTEGER
);
CREATE INDEX IF NOT EXISTS tokens_session ON tokens(session_id);

-- File kết quả tải về qua link ngắn hạn (chỉ lưu băm của token trong link).
CREATE TABLE IF NOT EXISTS files (
  token_hash  TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  path        TEXT NOT NULL,
  filename    TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- Nhật ký gọi tool theo người dùng.
CREATE TABLE IF NOT EXISTS audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  session_id  TEXT,
  username    TEXT,
  client_id   TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  ok          INTEGER NOT NULL,
  ms          INTEGER
);
`;

export type Db = DatabaseSync;

export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "vattu-mcp.db"));
  db.exec(SCHEMA);
  return db;
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Dọn bản ghi hết hạn. Gọi định kỳ. Trả về danh sách file cần xoá trên đĩa. */
export function purgeExpired(db: Db): string[] {
  const t = now();
  db.prepare("DELETE FROM pending_auth WHERE expires_at < ?").run(t);
  db.prepare("DELETE FROM auth_codes WHERE expires_at < ?").run(t - 3600);
  db.prepare("DELETE FROM tokens WHERE expires_at < ?").run(t - 86400);
  // Phiên đã thu hồi quá 7 ngày, hoặc không còn token nào sống quá 1 ngày → xoá (kéo theo token ERP mã hoá).
  db.prepare(`DELETE FROM erp_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?)
    OR (created_at < ? AND NOT EXISTS (SELECT 1 FROM tokens WHERE tokens.session_id = erp_sessions.id AND tokens.revoked_at IS NULL AND tokens.expires_at > ?))`)
    .run(t - 7 * 86400, t - 86400, t);
  const files = db.prepare("SELECT path FROM files WHERE expires_at < ?").all(t) as { path: string }[];
  db.prepare("DELETE FROM files WHERE expires_at < ?").run(t);
  db.prepare("DELETE FROM audit WHERE ts < ?").run(t - 180 * 86400);
  return files.map(row => row.path);
}

export function audit(db: Db, entry: { sessionId?: string; username?: string; clientId?: string; action: string; detail?: unknown; ok: boolean; ms?: number }): void {
  const detail = entry.detail === undefined ? null : JSON.stringify(entry.detail).slice(0, 1000);
  db.prepare("INSERT INTO audit (ts, session_id, username, client_id, action, detail, ok, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(now(), entry.sessionId ?? null, entry.username ?? null, entry.clientId ?? null, entry.action, detail, entry.ok ? 1 : 0, entry.ms ?? null);
}
