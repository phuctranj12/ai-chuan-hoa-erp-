// Đối chiếu TRỰC TIẾP với ERP bằng token của người dùng: Nhóm/Vật tư có tồn tại, ma trận quản lý
// thông số (cột nào bắt buộc) và từng giá trị có trong danh sách giá trị ERP của đúng nhóm hay không.
import type { BimClient, BimItem, BimValue, ValueList } from "../erp/bim.ts";
import { POLICY } from "../erp/policies.ts";
import { MATRIX_COLUMNS, type Engine, type ResultRow } from "./engine.ts";

/** Khoá `fields` của ERP (CodeGenConditionField) → tên cột hiển thị. Đã đối chiếu với snapshot ngày 2026-11-03. */
export const MATRIX_FIELD_COLUMN: Record<string, string> = {
  itemgroup: "Nhóm vật tư",
  item: "Vật tư",
  size: "Kích thước",
  range: "Dải thông số kỹ thuật",
  specification: "Tiêu chuẩn",
  installtype: "Kiểu lắp đặt",
  finish: "Hoàn thiện",
  material: "Thông số kỹ thuật khác",
  packagingitem: "Quy cách đóng gói",
  unit: "Đơn vị tính",
  manufacture: "Hãng sản xuất",
  origin: "Xuất xứ",
  model: "Mã hiệu",
  itemmajor: "Loại vật tư",
};

/** Cột có danh sách giá trị kiểm được trên ERP. `perGroup` = giá trị phải được gán cho đúng nhóm vật tư. */
export const VALUE_LISTS: Record<string, { list: ValueList; policy: string; perGroup: boolean }> = {
  "Kích thước": { list: "Size", policy: POLICY.size, perGroup: true },
  "Dải thông số kỹ thuật": { list: "Range", policy: POLICY.range, perGroup: true },
  "Tiêu chuẩn": { list: "Specification", policy: POLICY.standard, perGroup: false },
  "Kiểu lắp đặt": { list: "InstallType", policy: POLICY.installType, perGroup: false },
  "Hoàn thiện": { list: "Finish", policy: POLICY.finish, perGroup: false },
  "Xuất xứ": { list: "Origin", policy: POLICY.origin, perGroup: false },
};

export const EVIDENCE = {
  snapshot: "Đối chiếu snapshot đóng gói",
  matrixOnly: "Đã đối chiếu trực tiếp Ma trận quản lý thông số ERP; chưa đối chiếu danh sách giá trị ERP",
  full: "Đã đối chiếu trực tiếp với Ma trận quản lý thông số và danh sách giá trị ERP hiện tại",
} as const;

export type ValueStatus = "có trong ERP" | "chưa gán cho nhóm" | "đang ngưng" | "chưa có trong ERP" | "không có quyền xem";

export type ValueCheck = { column: string; value: string; part: string; status: ValueStatus; matched?: string };

export type MaterialLookup = {
  group?: { name: string; code: string; active: boolean };
  item?: { name: string; code: string; active: boolean; unit?: string };
  note?: string;
};

export type MatrixRow = {
  group: string;
  groupCode: string;
  item: string;
  itemCode: string;
  required: string[];
  configured: boolean;
};

export class LiveVerifier {
  private readonly bim: BimClient;
  private readonly engine: Engine;

  constructor(bim: BimClient, engine: Engine) {
    this.bim = bim;
    this.engine = engine;
  }

  private same(a: unknown, b: unknown): boolean {
    return typeof a === "string" && typeof b === "string" && a !== "" && this.engine.fold(a) === this.engine.fold(b);
  }

  /** Tìm Nhóm vật tư (theo tên hoặc mã) và Vật tư trong đúng nhóm trên ERP. */
  async findMaterial(sessionId: string, groupName: string, materialName?: string): Promise<MaterialLookup> {
    const groups = await this.bim.itemGroups(sessionId);
    const group = groups.find(g => this.same(g.name, groupName) || this.same(g.code, groupName));
    if (!group) return { note: `Không tìm thấy Nhóm vật tư "${groupName}" trên ERP` };
    const out: MaterialLookup = { group: { name: group.name, code: group.code, active: group.isActive === 1 } };
    if (!materialName) return out;
    const items = await this.bim.itemsInGroup(sessionId, group.code);
    const item = items.find(i => this.same(i.name, materialName) || this.same(i.code, materialName));
    if (!item) return { ...out, note: `Không tìm thấy Vật tư "${materialName}" trong nhóm "${group.name}" trên ERP` };
    return { ...out, item: { name: item.name, code: item.code, active: item.isActive === 1, unit: item.unitName } };
  }

  async searchMaterials(sessionId: string, keyword: string, groupName?: string, max = 30): Promise<{ total: number; items: BimItem[]; groupNote?: string }> {
    let groupCode: string | undefined;
    let groupNote: string | undefined;
    if (groupName) {
      const lookup = await this.findMaterial(sessionId, groupName);
      groupCode = lookup.group?.code;
      if (!groupCode) groupNote = lookup.note;
    }
    const page = await this.bim.searchItems(sessionId, keyword, groupCode, max);
    return { total: page.totalCount, items: page.items, groupNote };
  }

  async matrixRow(sessionId: string, groupCode: string, itemCodeOrName: string): Promise<MatrixRow | undefined> {
    const matrix = await this.bim.matrix(sessionId, groupCode);
    if (!matrix) return undefined;
    const item = matrix.items.find(i => this.same(i.itemCode, itemCodeOrName) || this.same(i.itemName, itemCodeOrName));
    if (!item) return undefined;
    return {
      group: matrix.itemGroupName,
      groupCode: matrix.itemGroupCode,
      item: item.itemName,
      itemCode: item.itemCode,
      required: item.fields.map(field => MATRIX_FIELD_COLUMN[field] ?? field),
      configured: item.isExisting,
    };
  }

  private valueMatches(row: BimValue, part: string): boolean {
    return [row.name, row.description, row.code, row.sizeName].some(text => this.same(text, part));
  }

  /** Kiểm một giá trị. Kích thước nhiều nhánh (DN65x40) được tách và kiểm từng phần như hướng dẫn rà soát. */
  async checkValue(sessionId: string, column: string, value: string, groupCode?: string): Promise<ValueCheck[]> {
    const spec = VALUE_LISTS[column];
    if (!spec || !value || value === "thiếu") return [];
    const parts = column === "Kích thước" ? this.engine.splitDimension(value) : [value];
    const results: ValueCheck[] = [];
    for (const part of parts) {
      let candidates = await this.bim.searchValues(sessionId, spec.list, part);
      // DN20 lưu tên "20"/mô tả "DN20": nếu tìm theo "DN20" không ra thì thử bỏ tiền tố.
      if (!candidates.some(row => this.valueMatches(row, part)) && /^(DN|D)\d/i.test(part)) {
        candidates = await this.bim.searchValues(sessionId, spec.list, part.replace(/^(DN|D)/i, ""));
      }
      const matches = candidates.filter(row => this.valueMatches(row, part));
      if (!matches.length) {
        results.push({ column, value, part, status: "chưa có trong ERP" });
        continue;
      }
      const active = matches.filter(row => row.isActive === 1);
      if (!active.length) {
        results.push({ column, value, part, status: "đang ngưng", matched: matches[0].description || matches[0].name });
        continue;
      }
      if (spec.perGroup && groupCode) {
        const linked = active.find(row => (row.itemGroupSizes ?? row.itemGroupRanges ?? [])
          .some(link => link.itemGroupCode === groupCode && link.isActive !== 0));
        if (!linked) {
          results.push({ column, value, part, status: "chưa gán cho nhóm", matched: active[0].description || active[0].name });
          continue;
        }
        results.push({ column, value, part, status: "có trong ERP", matched: linked.description || linked.name });
        continue;
      }
      results.push({ column, value, part, status: "có trong ERP", matched: active[0].description || active[0].name });
    }
    return results;
  }

  /**
   * Nâng một dòng kết quả lõi lên mức đối chiếu trực tiếp: xác nhận Nhóm/Vật tư trên ERP, tính lại
   * `thiếu` theo ma trận ERP hiện tại và kiểm từng giá trị mà người dùng có quyền xem.
   */
  async verifyRow(sessionId: string, row: ResultRow, policies: ReadonlySet<string>): Promise<LiveRowReport> {
    const group = row.result["Nhóm vật tư"], material = row.result["Vật tư"];
    const report: LiveRowReport = { evidence: EVIDENCE.snapshot, notes: [], values: [], matrixChanges: [] };
    if (!group || group === "thiếu" || !material || material === "thiếu") {
      report.notes.push("Chưa xác định Nhóm/Vật tư nên không đối chiếu ERP");
      return report;
    }
    const lookup = await this.findMaterial(sessionId, group, material);
    if (!lookup.group || !lookup.item) {
      report.notes.push(lookup.note ?? "Không tìm thấy trên ERP");
      report.erpCheck = lookup.note;
      return report;
    }
    if (!lookup.item.active) report.notes.push(`Vật tư ${lookup.item.code} đang ngưng kích hoạt trên ERP`);
    report.itemCode = lookup.item.code;

    if (policies.has(POLICY.codeRule)) {
      const matrix = await this.matrixRow(sessionId, lookup.group.code, lookup.item.code);
      if (matrix) {
        report.evidence = EVIDENCE.matrixOnly;
        report.required = matrix.required;
        const requiredSet = new Set(matrix.required);
        for (const column of MATRIX_COLUMNS) {
          const liveRequired = requiredSet.has(column), snapshotRequired = row.matrixRequired[column];
          if (liveRequired !== snapshotRequired) report.matrixChanges.push({ column, erp: liveRequired, snapshot: snapshotRequired });
        }
      } else {
        report.notes.push("ERP chưa có hàng ma trận cho vật tư này; giữ ma trận snapshot");
      }
    } else {
      report.notes.push(`Không có quyền ${POLICY.codeRule} nên không đọc ma trận ERP`);
    }

    let allChecked = report.evidence === EVIDENCE.matrixOnly;
    for (const column of Object.keys(VALUE_LISTS)) {
      const value = row.result[column];
      if (!value || value === "thiếu") continue;
      if (!policies.has(VALUE_LISTS[column].policy)) {
        report.values.push({ column, value, part: value, status: "không có quyền xem" });
        allChecked = false;
        continue;
      }
      report.values.push(...await this.checkValue(sessionId, column, value, lookup.group.code));
    }
    // Quy cách đóng gói / Thông số kỹ thuật khác chưa có danh sách giá trị kiểm được qua API.
    for (const column of ["Quy cách đóng gói", "Thông số kỹ thuật khác"]) {
      const value = row.result[column];
      if (value && value !== "thiếu") {
        allChecked = false;
        report.notes.push(`${column} "${value}" chưa kiểm trực tiếp được trên ERP`);
      }
    }
    if (allChecked && report.evidence === EVIDENCE.matrixOnly) report.evidence = EVIDENCE.full;
    return report;
  }
}

export type LiveRowReport = {
  evidence: string;
  itemCode?: string;
  required?: string[];
  matrixChanges: { column: string; erp: boolean; snapshot: boolean }[];
  values: ValueCheck[];
  notes: string[];
  erpCheck?: string;
};

/** Áp báo cáo ERP vào dòng kết quả: `thiếu` theo ma trận ERP, cột Kiểm tra ERP theo giá trị ERP. */
export function applyLiveReport(row: ResultRow, report: LiveRowReport): ResultRow {
  const result = { ...row.result };
  const matrixRequired = { ...row.matrixRequired };
  if (report.required) {
    const required = new Set(report.required);
    for (const column of MATRIX_COLUMNS) {
      matrixRequired[column] = required.has(column);
      if (required.has(column) && !result[column]) result[column] = "thiếu";
      if (!required.has(column) && result[column] === "thiếu") result[column] = "";
    }
  }
  if (report.erpCheck) return { ...row, result, matrixRequired, "Kiểm tra ERP": report.erpCheck };
  const messages: string[] = [];
  const missing = MATRIX_COLUMNS.filter(column => result[column] === "thiếu");
  if (missing.length) messages.push(`Chưa đủ thông tin: ${missing.join(", ")}`);
  const absent = report.values.filter(v => v.status === "chưa có trong ERP").map(v => v.part);
  if (absent.length) messages.push(`${[...new Set(absent)].join(", ")} chưa có trong ERP`);
  const unlinked = report.values.filter(v => v.status === "chưa gán cho nhóm").map(v => v.part);
  if (unlinked.length) messages.push(`${[...new Set(unlinked)].join(", ")} có trong ERP nhưng chưa gán cho nhóm này`);
  const inactive = report.values.filter(v => v.status === "đang ngưng").map(v => v.part);
  if (inactive.length) messages.push(`${[...new Set(inactive)].join(", ")} đang ngưng kích hoạt trên ERP`);
  // Giá trị không kiểm được trên ERP (thiếu quyền) giữ nguyên cảnh báo snapshot của lõi, nếu có.
  const unchecked = report.values.filter(v => v.status === "không có quyền xem").map(v => v.part);
  const snapshotIssue = row["Kiểm tra ERP"].split("; ").find(part => part.endsWith("chưa có trong snapshot đóng gói"));
  if (unchecked.length && snapshotIssue) messages.push(snapshotIssue);
  return { ...row, result, matrixRequired, "Kiểm tra ERP": messages.join("; ") };
}
