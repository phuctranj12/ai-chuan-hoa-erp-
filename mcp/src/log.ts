// Log JSON một dòng ra stderr. KHÔNG bao giờ truyền mật khẩu, token, header Authorization vào đây.
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
function write(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < (ORDER[process.env.VT_LOG_LEVEL as Level] ?? ORDER.info)) return;
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })}\n`);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
