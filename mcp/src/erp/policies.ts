// Quyền do admin ERP cấp (ABP grantedPolicies). MCP chỉ ĐỌC và áp đúng danh sách này,
// không tự đặt thêm quy tắc quyền nào.
import type { Config } from "../config.ts";
import { ErpAuthRejected, ErpUnavailable } from "./oidc.ts";

export const POLICY = {
  discipline: "Company.Material.Discipline.Read",
  group: "Company.Material.Group.Read",
  item: "Company.Material.Item.Read",
  size: "Company.Material.Size.Read",
  range: "Company.Material.SpecRange.Read",
  standard: "Company.Material.Standard.Read",
  finish: "Company.Material.Finishing.Read",
  installType: "Company.Material.InstallationType.Read",
  origin: "Company.Material.Origin.Read",
  installationSpace: "Company.Material.InstallationSpace.Read",
  codeRule: "Company.Material.CodeRule.Read",
} as const;

/** Chỉ giữ các policy liên quan danh mục vật tư để phiên gọn; thêm tiền tố nếu sau này có tool mới. */
const KEEP_PREFIXES = ["Company.Material."];

export async function fetchGrantedPolicies(config: Config, accessToken: string): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(`${config.erp.apiBase}/api/abp/application-configuration`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(config.erp.timeoutMs),
    });
  } catch (error) {
    throw new ErpUnavailable(`Không đọc được quyền ERP: ${(error as Error).message}`);
  }
  if (response.status === 401 || response.status === 403) throw new ErpAuthRejected(`HTTP ${response.status}`);
  if (!response.ok) throw new ErpUnavailable(`Đọc quyền ERP lỗi HTTP ${response.status}`);
  const body = await response.json() as { auth?: { grantedPolicies?: Record<string, boolean> } };
  const granted = body.auth?.grantedPolicies ?? {};
  return Object.entries(granted)
    .filter(([name, ok]) => ok === true && KEEP_PREFIXES.some(prefix => name.startsWith(prefix)))
    .map(([name]) => name)
    .sort();
}

export function missingPolicies(granted: readonly string[], required: readonly string[]): string[] {
  const set = new Set(granted);
  return required.filter(policy => !set.has(policy));
}
