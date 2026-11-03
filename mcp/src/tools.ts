// Tool, resource, prompt của MCP. Mỗi tool tự khai báo quyền ERP cần có (grantedPolicies của người gọi).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.ts";
import { DISPLAY_COLUMNS, MATRIX_COLUMNS, SOURCE_COLUMN, type Engine, type ResultRow } from "./core/engine.ts";
import { applyLiveReport, EVIDENCE, VALUE_LISTS, type LiveRowReport, type LiveVerifier, type ValueCheck } from "./core/live.ts";
import { buildXlsx } from "./core/xlsx.ts";
import { ErpForbidden, type BimClient } from "./erp/bim.ts";
import { ErpUnavailable } from "./erp/oidc.ts";
import { missingPolicies, POLICY } from "./erp/policies.ts";
import { SessionExpired, type Session, type SessionStore } from "./erp/session.ts";
import type { FileStore } from "./files.ts";
import { errorMessage, log } from "./log.ts";
import { audit, type Db } from "./store/db.ts";

export type ToolDeps = {
  config: Config;
  db: Db;
  engine: Engine;
  sessions: SessionStore;
  bim: BimClient;
  live: LiveVerifier;
  files: FileStore;
};

const INSTRUCTIONS = `MCP "AI Chuẩn hóa vật tư ERP Hawee": chuẩn hóa mô tả vật tư theo danh mục, ma trận quản lý thông số và danh sách giá trị ERP.
Mọi dữ liệu ERP được đọc bằng tài khoản ERP của chính người dùng; ERP quyết định họ được xem gì.

Quy trình bắt buộc: Lõi đề xuất (chuan_hoa_vat_tu) → AI kiểm định ngữ nghĩa từng dòng (resource vt://huong-dan/ra-soat) → đối chiếu ERP.
- Mọi đầu vào (một mô tả, bảng dán, file) đều phải chạy qua chuan_hoa_vat_tu; kết quả lõi chỉ là ứng viên.
- Giữ nguyên văn mô tả nguồn ở cột "Mô tả hàng hóa của NCC". identityText = mô tả nguyên văn; attributeText = mô tả kèm thông số; không bịa groupHint/materialHint.
- Bảo toàn dấu hiệu đích danh: loại vật tư (Cút/Co, Chếch/Lơi, Tê, Y, Côn, Bích, Ống…), kiểu (ren, hàn, dài, đặc, thu, đều, trong, ngoài, mềm, cứng), vật liệu, mọi kích thước/nhánh (DN32/25 → DN32x25, không mất nhánh). Lõi làm mất dấu hiệu → loại kết quả đó, dùng tim_vat_tu tìm lại trong đúng Nhóm; chưa tìm được thì ghi "thiếu" tại Vật tư, không lấp bằng vật tư sai họ.
- "thiếu" chỉ ở cột bắt buộc (dấu V trong ma trận). Cột không bắt buộc và không có giá trị để trống. Không tự bịa Hãng sản xuất, Xuất xứ, Mã hiệu.
- Bảng trả trong chat dùng đúng 10 cột, đúng thứ tự: ${DISPLAY_COLUMNS.join(" | ")}. Không thêm cột riêng; Kiểm tra ERP nêu ngoài bảng hoặc trong file.
- Mức bằng chứng: nêu đúng giá trị "evidence" tool trả về ("${EVIDENCE.snapshot}" / "${EVIDENCE.matrixOnly}" / "${EVIDENCE.full}"). Không nói đã đối chiếu ERP khi evidence là snapshot.
- Sau khi người dùng xem kết quả nhiều dòng/file: hỏi MỘT lần mục đích "Up định mức" hay "Đơn hàng/Nhập kho", rồi gọi xuat_file_ket_qua với mẫu tương ứng và đưa đúng download_url.
- Không nhận chuẩn hóa nhân công, SUM BOQ, MAP BOQ, quản trị Alias hay ghi/sửa dữ liệu ERP — MCP này chỉ đọc.
- Báo cáo: số dòng, số dòng nhận diện đủ, số dòng có "thiếu", số dòng có cảnh báo Kiểm tra ERP, số dòng AI loại do xung đột nguồn, và mức bằng chứng.`;

class ToolFailure extends Error {}

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const itemSchema = z.object({
  identityText: z.string().min(1).max(2000).describe("Mô tả vật tư NGUYÊN VĂN từ nguồn"),
  attributeText: z.string().max(4000).optional().describe("Mô tả kèm thông số kỹ thuật nguồn; bỏ trống = dùng identityText"),
  groupHint: z.string().max(200).optional().describe("Chỉ điền khi nguồn ghi rõ Nhóm vật tư"),
  materialHint: z.string().max(200).optional().describe("Chỉ điền khi nguồn ghi rõ Vật tư"),
  contextGroupHint: z.string().max(200).optional().describe("Nhóm của dòng cha/tiêu đề vùng trong file, nếu có"),
  contextMaterialHint: z.string().max(200).optional().describe("Vật tư của dòng cha/tiêu đề vùng trong file, nếu có"),
});

const TEMPLATES: Record<string, { label: string; columns: string[] }> = {
  don_hang_nhap_kho: {
    label: "Đơn hàng/Nhập kho",
    columns: [SOURCE_COLUMN, "Kiểm tra ERP", "Nhóm vật tư", "Vật tư", "Thông số kỹ thuật khác", "Kích thước", "Tiêu chuẩn", "Dải thông số kỹ thuật", "Kiểu lắp đặt", "Hoàn thiện", "ĐV quy đổi", "Hãng sản xuất", "Xuất xứ", "Mã hiệu"],
  },
  up_dinh_muc: {
    label: "Up định mức",
    columns: [SOURCE_COLUMN, "Kiểm tra ERP", "Mã gói", "Giai đoạn", "Nhóm vật tư", "Vật tư", "Thông số kỹ thuật khác", "Kích thước", "Tiêu chuẩn", "Dải thông số kỹ thuật", "Kiểu lắp đặt", "Hoàn thiện", "Quy cách đóng gói", "Hãng sản xuất", "Xuất xứ", "Mã hiệu"],
  },
  bang_10_cot: {
    label: "Bảng chuẩn hóa",
    columns: [...DISPLAY_COLUMNS, "Kiểm tra ERP"],
  },
};

function readReference(skillDir: string, name: string): string {
  try {
    return readFileSync(join(skillDir, "references", name), "utf8");
  } catch {
    return `(Không tìm thấy ${name})`;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

export function buildServer(deps: ToolDeps): McpServer {
  const { config, db, engine, sessions, bim, live, files } = deps;
  const server = new McpServer(
    { name: "vattu-erp-hawee", title: "AI Chuẩn hóa vật tư ERP", version: config.version },
    { instructions: INSTRUCTIONS },
  );

  /** Chạy một tool: lấy phiên ERP của người gọi, kiểm quyền ERP, ghi audit, dịch lỗi ERP thành thông báo dễ hiểu. */
  async function run(name: string, authInfo: AuthInfo | undefined, required: string[], detail: unknown, fn: (session: Session) => Promise<unknown>): Promise<CallToolResult> {
    const started = Date.now();
    const sessionId = typeof authInfo?.extra?.sessionId === "string" ? authInfo.extra.sessionId : undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) return fail("Phiên đăng nhập ERP đã kết thúc. Hãy ngắt kết nối connector rồi kết nối (đăng nhập ERP) lại.");
    const record = (okFlag: boolean, extra?: unknown) => audit(db, {
      sessionId: session.id, username: session.username, clientId: authInfo?.clientId, action: `tool.${name}`,
      detail: extra === undefined ? detail : { ...(detail as object), ...(extra as object) }, ok: okFlag, ms: Date.now() - started,
    });
    const missing = missingPolicies(session.policies, required);
    if (missing.length) {
      record(false, { missing });
      return fail(`Tài khoản ERP ${session.username} chưa được admin ERP cấp quyền: ${missing.join(", ")}. Liên hệ quản trị ERP nếu cần dùng chức năng này.`);
    }
    try {
      const data = await fn(session);
      record(true);
      return ok(data);
    } catch (error) {
      record(false, { error: errorMessage(error) });
      if (error instanceof SessionExpired) return fail(`${error.message} Hãy ngắt kết nối connector rồi kết nối lại.`);
      if (error instanceof ErpForbidden || error instanceof ErpUnavailable || error instanceof ToolFailure) return fail(error.message);
      log.error("tool.error", { tool: name, error: errorMessage(error) });
      return fail("Lỗi hệ thống khi xử lý yêu cầu. Thử lại sau hoặc báo quản trị MCP.");
    }
  }

  server.registerTool("chuan_hoa_vat_tu", {
    title: "Chuẩn hóa vật tư theo ERP",
    description: "Chạy lõi chuẩn hóa vật tư Hawee cho 1–500 mô tả (giữ thứ tự), trả Nhóm vật tư, Vật tư và 7 thuộc tính ERP, cột 'Kiểm tra ERP', các cột bắt buộc. "
      + "Mặc định đối chiếu trực tiếp ERP (ma trận + danh sách giá trị) bằng quyền của người dùng cho các dòng đã nhận diện. Kết quả lõi là ỨNG VIÊN: AI phải kiểm định ngữ nghĩa từng dòng trước khi trả người dùng. File nhiều dòng: gửi theo lô ≤500 dòng, giữ thứ tự và ngữ cảnh.",
    inputSchema: {
      items: z.array(itemSchema).min(1).max(500),
      doi_chieu_erp: z.boolean().default(true).describe("Đối chiếu trực tiếp ERP cho các dòng đã nhận diện (tối đa theo cấu hình máy chủ)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ items, doi_chieu_erp }, extra) => run("chuan_hoa_vat_tu", extra.authInfo, [POLICY.group, POLICY.item], { items: items.length, live: doi_chieu_erp }, async session => {
    // Lõi đọc thông số từ attributeText; model hay chỉ gửi identityText nên mặc định lấy chính mô tả đó.
    let rows = engine.normalize(items.map(item => ({ ...item, attributeText: item.attributeText?.trim() ? item.attributeText : item.identityText })));
    const reports = new Map<number, LiveRowReport>();
    let liveSkipped = 0;
    if (doi_chieu_erp) {
      const policySet = new Set(session.policies);
      const candidates = rows.filter(row => row.result["Nhóm vật tư"] !== "thiếu" && row.result["Vật tư"] !== "thiếu");
      const chosen = candidates.slice(0, config.liveVerifyMaxRows);
      liveSkipped = candidates.length - chosen.length;
      // Các dòng cho cùng kết quả lõi (khác mô tả nguồn) chỉ đối chiếu ERP một lần.
      const keyOf = (row: ResultRow) => JSON.stringify([{ ...row.result, [SOURCE_COLUMN]: "" }, row.matrixRequired]);
      const unique = [...new Map(chosen.map(row => [keyOf(row), row])).values()];
      const byKey = new Map(await mapLimit(unique, 4, async row => [keyOf(row), await live.verifyRow(session.id, row, policySet)] as const));
      for (const row of chosen) reports.set(row.row, byKey.get(keyOf(row))!);
      rows = rows.map(row => reports.has(row.row) ? applyLiveReport(row, reports.get(row.row)!) : row);
    }
    const output = rows.map(row => {
      const report = reports.get(row.row);
      return {
        row: row.row,
        source: row.source,
        "Kiểm tra ERP": row["Kiểm tra ERP"],
        result: row.result,
        matrixRequired: row.matrixRequired,
        evidence: report?.evidence ?? EVIDENCE.snapshot,
        erp: report ? { itemCode: report.itemCode, matrixChanges: report.matrixChanges, values: report.values, notes: report.notes } : undefined,
      };
    });
    const count = (fn: (row: (typeof output)[number]) => boolean) => output.filter(fn).length;
    return {
      schemaVersion: "mcp-1",
      summary: {
        rows: output.length,
        identified: count(r => r.result["Nhóm vật tư"] !== "thiếu" && r.result["Vật tư"] !== "thiếu"),
        withMissing: count(r => MATRIX_COLUMNS.some(c => r.result[c] === "thiếu") || r.result["Vật tư"] === "thiếu"),
        withErpWarning: count(r => r["Kiểm tra ERP"] !== ""),
        evidence: Object.fromEntries(Object.values(EVIDENCE).map(level => [level, count(r => r.evidence === level)])),
        liveSkipped,
        snapshotDate: engine.provenance.importDate,
      },
      columns: DISPLAY_COLUMNS,
      items: output,
    };
  }));

  server.registerTool("tim_vat_tu", {
    title: "Tìm vật tư trên ERP",
    description: "Tìm Vật tư trên ERP theo từ khoá (tên/mã), có thể giới hạn trong một Nhóm vật tư. Dùng khi kết quả lõi bị loại do xung đột ngữ nghĩa để tìm tên ERP đúng trong đúng nhóm.",
    inputSchema: {
      tu_khoa: z.string().min(1).max(200),
      nhom_vat_tu: z.string().max(200).optional().describe("Tên hoặc mã Nhóm vật tư"),
      gioi_han: z.number().int().min(1).max(100).default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ tu_khoa, nhom_vat_tu, gioi_han }, extra) => run("tim_vat_tu", extra.authInfo, [POLICY.group, POLICY.item], { tu_khoa, nhom_vat_tu }, async session => {
    const found = await live.searchMaterials(session.id, tu_khoa, nhom_vat_tu, gioi_han);
    if (found.groupNote) throw new ToolFailure(found.groupNote);
    return {
      total: found.total,
      items: found.items.map(item => ({
        "Nhóm vật tư": item.itemGroupName, "Mã nhóm": item.itemGroupCode, "Vật tư": item.name, "Mã vật tư": item.code,
        "Đơn vị tính": item.unitName, "Mô tả": item.description ?? undefined, "Kích hoạt": item.isActive === 1,
      })),
    };
  }));

  server.registerTool("xem_ma_tran", {
    title: "Xem ma trận quản lý thông số",
    description: "Đọc trực tiếp Ma trận quản lý thông số ERP của một Vật tư: các cột bắt buộc (dấu V). So sánh với ma trận trong snapshot.",
    inputSchema: {
      vat_tu: z.string().min(1).max(200).describe("Tên hoặc mã Vật tư ERP"),
      nhom_vat_tu: z.string().max(200).optional().describe("Tên hoặc mã Nhóm vật tư (nên có để tránh trùng tên)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ vat_tu, nhom_vat_tu }, extra) => run("xem_ma_tran", extra.authInfo, [POLICY.group, POLICY.item, POLICY.codeRule], { vat_tu, nhom_vat_tu }, async session => {
    let groupCode: string | undefined, itemCode: string | undefined;
    if (nhom_vat_tu) {
      const lookup = await live.findMaterial(session.id, nhom_vat_tu, vat_tu);
      if (!lookup.item || !lookup.group) throw new ToolFailure(lookup.note ?? "Không tìm thấy vật tư trên ERP");
      groupCode = lookup.group.code;
      itemCode = lookup.item.code;
    } else {
      const found = await bim.searchItems(session.id, vat_tu, undefined, 50);
      const exact = found.items.filter(item => engine.fold(item.name) === engine.fold(vat_tu) || engine.fold(item.code) === engine.fold(vat_tu));
      if (exact.length !== 1) {
        throw new ToolFailure(exact.length ? `Có ${exact.length} vật tư trùng tên "${vat_tu}" ở các nhóm: ${exact.map(i => i.itemGroupName).join("; ")}. Hãy chỉ rõ nhom_vat_tu.`
          : `Không tìm thấy vật tư "${vat_tu}" trên ERP. Dùng tim_vat_tu để tìm tên đúng.`);
      }
      groupCode = exact[0].itemGroupCode;
      itemCode = exact[0].code;
    }
    const row = await live.matrixRow(session.id, groupCode, itemCode);
    if (!row) throw new ToolFailure("ERP chưa có hàng ma trận cho vật tư này.");
    const snapshot = engine.requirements(row.item);
    return {
      "Nhóm vật tư": row.group, "Mã nhóm": row.groupCode, "Vật tư": row.item, "Mã vật tư": row.itemCode,
      "Cột bắt buộc (V)": row.required,
      "Bắt buộc theo 7 cột chuẩn hóa": Object.fromEntries(MATRIX_COLUMNS.map(column => [column, row.required.includes(column)])),
      "Khác snapshot": snapshot.hasMatrix ? MATRIX_COLUMNS.filter(c => Boolean(snapshot.fields[c]) !== row.required.includes(c)) : "snapshot không có vật tư này",
      evidence: EVIDENCE.matrixOnly,
    };
  }));

  const valueShape = {
    kich_thuoc: z.string().max(200).optional(),
    dai_thong_so: z.string().max(200).optional(),
    tieu_chuan: z.string().max(200).optional(),
    kieu_lap_dat: z.string().max(200).optional(),
    hoan_thien: z.string().max(200).optional(),
    xuat_xu: z.string().max(200).optional(),
  };
  const VALUE_KEYS: Record<keyof typeof valueShape, string> = {
    kich_thuoc: "Kích thước", dai_thong_so: "Dải thông số kỹ thuật", tieu_chuan: "Tiêu chuẩn",
    kieu_lap_dat: "Kiểu lắp đặt", hoan_thien: "Hoàn thiện", xuat_xu: "Xuất xứ",
  };
  server.registerTool("kiem_tra_gia_tri", {
    title: "Kiểm tra giá trị trên ERP",
    description: "Kiểm từng giá trị thuộc tính có trong danh sách giá trị ERP hiện tại hay không. Kích thước và Dải thông số kiểm thêm việc đã gán cho đúng Nhóm vật tư; kích thước nhiều nhánh (DN65x40) kiểm từng nhánh.",
    inputSchema: { nhom_vat_tu: z.string().min(1).max(200).describe("Tên hoặc mã Nhóm vật tư"), ...valueShape },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (args, extra) => run("kiem_tra_gia_tri", extra.authInfo, [POLICY.group], { nhom_vat_tu: args.nhom_vat_tu }, async session => {
    const lookup = await live.findMaterial(session.id, args.nhom_vat_tu);
    if (!lookup.group) throw new ToolFailure(lookup.note ?? "Không tìm thấy Nhóm vật tư");
    const policySet = new Set(session.policies);
    const checks: ValueCheck[] = [];
    for (const [key, column] of Object.entries(VALUE_KEYS) as [keyof typeof valueShape, string][]) {
      const value = args[key]?.trim();
      if (!value) continue;
      if (!policySet.has(VALUE_LISTS[column].policy)) {
        checks.push({ column, value, part: value, status: "không có quyền xem" });
        continue;
      }
      checks.push(...await live.checkValue(session.id, column, value, lookup.group.code));
    }
    if (!checks.length) throw new ToolFailure("Chưa nhập giá trị nào để kiểm.");
    return { "Nhóm vật tư": lookup.group.name, "Mã nhóm": lookup.group.code, ket_qua: checks };
  }));

  server.registerTool("xuat_file_ket_qua", {
    title: "Xuất file Excel kết quả",
    description: "Tạo file .xlsx từ các dòng kết quả đã được AI kiểm định, theo mẫu 'Đơn hàng/Nhập kho', 'Up định mức' hoặc bảng 10 cột. Trả download_url hết hạn sau 60 phút — đưa ĐÚNG link này cho người dùng. "
      + "Mỗi dòng là object {tên cột: giá trị}; cột ngoài mẫu (cột nghiệp vụ của người dùng) được giữ ở cuối. 'ĐV quy đổi' lấy từ 'Quy cách đóng gói' nếu không có.",
    inputSchema: {
      mau: z.enum(["don_hang_nhap_kho", "up_dinh_muc", "bang_10_cot"]),
      ten_file: z.string().max(100).optional(),
      dong: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1).max(5000),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ mau, ten_file, dong }, extra) => run("xuat_file_ket_qua", extra.authInfo, [], { mau, dong: dong.length }, async session => {
    const template = TEMPLATES[mau];
    const extraColumns = [...new Set(dong.flatMap(row => Object.keys(row)))]
      .filter(column => !template.columns.includes(column) && !(mau === "don_hang_nhap_kho" && column === "Quy cách đóng gói"));
    const header = [...template.columns, ...extraColumns];
    const rows = dong.map(row => header.map(column => {
      const value = column === "ĐV quy đổi" ? (row["ĐV quy đổi"] ?? row["Quy cách đóng gói"]) : row[column];
      return value === null || value === undefined ? "" : String(value);
    }));
    const base = (ten_file || `chuan-hoa-vat-tu-${mau}`).replace(/[^\p{L}\p{N}._ -]/gu, "").trim().slice(0, 80) || "ket-qua";
    const filename = `${base.replace(/\.xlsx$/i, "")}.xlsx`;
    const saved = files.save(session.id, filename, buildXlsx(template.label, header, rows));
    return { download_url: saved.url, het_han: saved.expiresAt, ten_file: filename, so_dong: rows.length, cot: header };
  }));

  server.registerTool("toi_la_ai", {
    title: "Tài khoản ERP đang dùng",
    description: "Cho biết tài khoản ERP đang kết nối (mã nhân viên, tên, vai trò) và các quyền danh mục vật tư ERP đã được cấp.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (_args, extra) => run("toi_la_ai", extra.authInfo, [], {}, async session => ({
    "Mã nhân viên": session.username, "Họ tên": session.displayName, email: session.email, "Vai trò ERP": session.role,
    "Quyền vật tư ERP": session.policies,
    "Chức năng dùng được": {
      chuan_hoa_vat_tu: missingPolicies(session.policies, [POLICY.group, POLICY.item]).length === 0,
      tim_vat_tu: missingPolicies(session.policies, [POLICY.group, POLICY.item]).length === 0,
      xem_ma_tran: missingPolicies(session.policies, [POLICY.group, POLICY.item, POLICY.codeRule]).length === 0,
      kiem_tra_gia_tri: missingPolicies(session.policies, [POLICY.group]).length === 0,
    },
  })));

  server.registerTool("trang_thai_du_lieu", {
    title: "Trạng thái dữ liệu",
    description: "Phiên bản lõi và snapshot đóng gói (ngày nhập, số bản ghi), ERP có đang truy cập được không.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (_args, extra) => run("trang_thai_du_lieu", extra.authInfo, [], {}, async () => ({
    mcpVersion: config.version,
    pluginVersion: engine.pluginVersion,
    snapshot: {
      importDate: engine.provenance.importDate,
      note: engine.provenance.note,
      nhomVatTu: engine.catalogs.NHOM_VAT_TU.length,
      vatTu: engine.catalogs.VAT_TU.length,
      maTran: engine.catalogs.MATRIX.length,
      sources: engine.provenance.sources?.map(s => ({ catalog: s.catalogKey, active: s.active })),
    },
    erpReachable: await bim.reachable(),
    liveVerifyMaxRows: config.liveVerifyMaxRows,
  })));

  const references: [string, string, string, string][] = [
    ["ra-soat", "review-guide.md", "Hướng dẫn rà soát kết quả", "Cổng kiểm định ngữ nghĩa, bất biến nghiệp vụ, cột Kiểm tra ERP"],
    ["quy-cach-dong-goi", "packaging-defaults.md", "Quy cách đóng gói mặc định", "Áp dụng khi nguồn không ghi quy cách"],
    ["kich-thuoc-mang-cap", "tray-size-rules.md", "Kích thước máng cáp", "Mẫu kích thước W/H/Z cho máng và phụ kiện"],
    ["quy-trinh-file", "spreadsheet-workflow.md", "Quy trình chuẩn hóa file", "Bộ cột kết quả, xử lý hàng loạt (phần chạy script được thay bằng tool chuan_hoa_vat_tu)"],
  ];
  for (const [slug, file, title, description] of references) {
    const text = readReference(config.skillDir, file);
    server.registerResource(slug, `vt://huong-dan/${slug}`, { title, description, mimeType: "text/markdown" },
      async uri => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text }] }));
  }

  server.registerPrompt("chuan_hoa_vat_tu", {
    title: "Chuẩn hóa vật tư",
    description: "Trình tự chuẩn hóa một hoặc nhiều mô tả vật tư theo ERP Hawee",
    argsSchema: { mo_ta: z.string().describe("Một hoặc nhiều mô tả vật tư, mỗi dòng một mô tả") },
  }, ({ mo_ta }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Chuẩn hóa các vật tư sau theo ERP Hawee:\n${mo_ta}\n\n`
          + "1. Gọi chuan_hoa_vat_tu với mỗi dòng là một item (identityText giữ nguyên văn).\n"
          + "2. Đọc vt://huong-dan/ra-soat, kiểm định ngữ nghĩa từng dòng; dòng xung đột thì dùng tim_vat_tu tìm lại trong đúng nhóm.\n"
          + `3. Trả bảng đúng 10 cột: ${DISPLAY_COLUMNS.join(" | ")}; nêu Kiểm tra ERP và mức bằng chứng ngoài bảng.`,
      },
    }],
  }));

  return server;
}
