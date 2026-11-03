// Trang HTML đăng nhập ERP. Không JavaScript, không tài nguyên ngoài; CSP chặn mọi thứ khác.
import type { Response } from "express";
import type { Config } from "../config.ts";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f4f5f7;--card:#fff;--fg:#1d2433;--muted:#5b6475;--line:#d5d9e0;--accent:#0b5cad;--err:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--card:#1d2128;--fg:#e8ebf0;--muted:#a3abb8;--line:#343a45;--accent:#5aa2ef;--err:#f97066}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
main{background:var(--card);border:1px solid var(--line);border-radius:12px;max-width:420px;width:100%;padding:28px}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:var(--muted)}label{display:block;font-weight:600;margin:14px 0 6px}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--fg);font-size:15px}
button{margin-top:20px;width:100%;padding:11px;border:0;border-radius:8px;background:var(--accent);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.err{color:var(--err);background:color-mix(in srgb,var(--err) 10%,transparent);border-radius:8px;padding:10px 12px;margin:0 0 12px}
.box{border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--muted);margin-top:16px}
code{font-size:12px;word-break:break-all}`;

function securityHeaders(res: Response, formTargets: string[]): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // form-action phải cho phép cả đích chuyển hướng sau khi submit (Chrome áp CSP lên redirect của form).
  res.setHeader("Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${formTargets.join(" ")}; frame-ancestors 'none'; base-uri 'none'`);
}

export function renderLoginPage(res: Response, config: Config, opts: { pendingId: string; csrf: string; clientName?: string; redirectUri: string; error?: string; username?: string }, status = 200): void {
  const target = new URL(opts.redirectUri);
  securityHeaders(res, [target.origin]);
  const client = opts.clientName ? escapeHtml(opts.clientName) : "Trợ lý AI";
  res.status(status).send(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đăng nhập ERP — AI Chuẩn hóa vật tư</title><style>${STYLE}</style></head>
<body><main>
<h1>Đăng nhập bằng tài khoản ERP</h1>
<p><strong>${client}</strong> xin quyền dùng <strong>AI Chuẩn hóa vật tư ERP</strong> thay bạn, với đúng quyền ERP của tài khoản bạn.</p>
${opts.error ? `<div class="err" role="alert">${escapeHtml(opts.error)}</div>` : ""}
<form method="post" action="/oauth/login" autocomplete="on">
<input type="hidden" name="pending" value="${escapeHtml(opts.pendingId)}">
<input type="hidden" name="csrf" value="${escapeHtml(opts.csrf)}">
<label for="u">Tên đăng nhập hoặc email ERP</label>
<input id="u" name="username" required maxlength="200" autocomplete="username" value="${escapeHtml(opts.username ?? "")}" autofocus>
<label for="p">Mật khẩu ERP</label>
<input id="p" name="password" type="password" required maxlength="500" autocomplete="current-password">
<button type="submit">Đăng nhập và cho phép</button>
</form>
<div class="box">Mật khẩu được chuyển thẳng tới ERP để xác thực và <strong>không được lưu</strong>. ERP quyết định bạn được xem gì.
Địa chỉ trang này phải là <code>${escapeHtml(config.publicBaseUrl.host)}</code>. Sau khi đăng nhập, bạn được chuyển về <code>${escapeHtml(target.host)}</code>.</div>
</main></body></html>`);
}

export function renderMessage(res: Response, title: string, message: string, status: number): void {
  securityHeaders(res, []);
  res.status(status).send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`);
}
