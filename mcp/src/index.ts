// Điểm khởi động: nạp cấu hình + lõi chuẩn hoá, mở DB, chạy HTTP. Log ra stderr (JSON).
import { createApp } from "./app.ts";
import { loadConfig, type Config } from "./config.ts";
import { Engine } from "./core/engine.ts";
import { LiveVerifier } from "./core/live.ts";
import { BimClient } from "./erp/bim.ts";
import { SessionStore } from "./erp/session.ts";
import { FileStore } from "./files.ts";
import { errorMessage, log } from "./log.ts";
import { openDb, purgeExpired } from "./store/db.ts";
import type { ToolDeps } from "./tools.ts";

export async function createDeps(config: Config): Promise<ToolDeps> {
  const db = openDb(config.dataDir);
  const engine = await Engine.load(config.skillDir);
  const sessions = new SessionStore(db, config);
  const bim = new BimClient(config, sessions);
  return { config, db, engine, sessions, bim, live: new LiveVerifier(bim, engine), files: new FileStore(db, config) };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const deps = await createDeps(config);
  const app = createApp(deps);
  const server = app.listen(config.port, config.host, () => {
    log.info("server.started", { url: config.publicBaseUrl.href, mcp: config.resourceUrl.href, port: config.port, version: config.version });
  });
  // Máy chủ không đặt timeout ngắn: một lần chuẩn hoá 500 dòng kèm đối chiếu ERP có thể mất vài chục giây.
  server.requestTimeout = 180_000;

  const sweep = setInterval(() => {
    try {
      deps.files.remove(purgeExpired(deps.db));
    } catch (error) {
      log.error("purge.failed", { error: errorMessage(error) });
    }
  }, 10 * 60 * 1000);
  sweep.unref();

  const shutdown = (signal: string) => {
    log.info("server.stopping", { signal });
    clearInterval(sweep);
    server.close(() => {
      deps.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (import.meta.main) {
  main().catch(error => {
    log.error("server.fatal", { error: errorMessage(error) });
    process.exit(1);
  });
}
