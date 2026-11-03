// File kết quả tải về qua link ngắn hạn. Link là bí mật (256 bit); DB chỉ lưu băm. Hết hạn → xoá file.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import { randomToken, sha256 } from "./store/crypto.ts";
import { now, type Db } from "./store/db.ts";

export class FileStore {
  private readonly dir: string;
  private readonly db: Db;
  private readonly config: Config;

  constructor(db: Db, config: Config) {
    this.db = db;
    this.config = config;
    this.dir = join(config.dataDir, "files");
    mkdirSync(this.dir, { recursive: true });
  }

  save(sessionId: string, filename: string, data: Buffer): { url: string; expiresAt: string } {
    const token = randomToken(32);
    const hash = sha256(token);
    const path = join(this.dir, `${hash}.bin`);
    writeFileSync(path, data, { mode: 0o600 });
    const expires = now() + this.config.fileTtlSec;
    this.db.prepare("INSERT INTO files (token_hash, session_id, path, filename, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(hash, sessionId, path, filename, expires);
    return { url: new URL(`/files/${token}`, this.config.publicBaseUrl).href, expiresAt: new Date(expires * 1000).toISOString() };
  }

  lookup(token: string): { path: string; filename: string } | undefined {
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return undefined;
    const row = this.db.prepare("SELECT path, filename, expires_at FROM files WHERE token_hash = ?").get(sha256(token)) as
      { path: string; filename: string; expires_at: number } | undefined;
    if (!row || row.expires_at < now()) return undefined;
    return { path: row.path, filename: row.filename };
  }

  remove(paths: string[]): void {
    for (const path of paths) rmSync(path, { force: true });
  }
}
