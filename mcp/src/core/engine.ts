// Bọc lõi chuẩn hoá của plugin (scripts/normalizer.js + assets/*) — KHÔNG sửa lõi, chỉ nạp và gọi.
// Logic sau normalizeMaterialBatch() chép nguyên từ scripts/normalize-materials.mjs; test/engine.test.ts
// so kết quả với chính script gốc để bắt mọi lệch.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { log } from "../log.ts";

export const SOURCE_COLUMN = "Mô tả hàng hóa của NCC";
export const MATRIX_COLUMNS = [
  "Kích thước",
  "Dải thông số kỹ thuật",
  "Tiêu chuẩn",
  "Kiểu lắp đặt",
  "Hoàn thiện",
  "Thông số kỹ thuật khác",
  "Quy cách đóng gói",
] as const;
export const DISPLAY_COLUMNS = [SOURCE_COLUMN, "Nhóm vật tư", "Vật tư", ...MATRIX_COLUMNS] as const;

export type InputItem = {
  identityText: string;
  attributeText?: string;
  groupHint?: string;
  materialHint?: string;
  contextGroupHint?: string;
  contextMaterialHint?: string;
};

export type ResultRow = {
  row: number;
  source: string;
  "Kiểm tra ERP": string;
  result: Record<string, string>;
  matrixRequired: Record<string, boolean>;
  sourceDerived: Record<string, unknown>;
};

type RawEntry = { result?: Record<string, string>; erpIssues?: string[]; sourceDerived?: Record<string, unknown> };
type NormalizerInstance = {
  requirements(material: string): { hasMatrix: boolean; fields: Record<string, boolean> };
  groupForMaterial(material: string): string;
  memo: Map<unknown, unknown>;
  aliasMemo: Map<unknown, unknown>;
  groupMemo: Map<unknown, unknown>;
  materialMemo: Map<unknown, unknown>;
  erpIssueMemo: Map<unknown, unknown>;
};
type NormalizerModule = {
  Normalizer: new (data: unknown) => NormalizerInstance;
  normalizeMaterialBatch(normalizer: NormalizerInstance, items: InputItem[]): RawEntry[];
  splitErpDimensionValues(value: string): string[];
  fold(value: string): string;
};

export type Catalogs = {
  NHOM_VAT_TU: Record<string, unknown>[];
  VAT_TU: Record<string, unknown>[];
  MATRIX: Record<string, unknown>[];
  [key: string]: unknown;
};

export type Provenance = { importDate?: string; basePluginVersion?: string; note?: string; sources?: { catalogKey: string; rows: number; active: number }[] };

const MEMO_LIMIT = 20000;

export class Engine {
  readonly catalogs: Catalogs;
  readonly provenance: Provenance;
  readonly pluginVersion: string;
  private readonly normalizer: NormalizerInstance;
  private readonly lib: NormalizerModule;

  private constructor(lib: NormalizerModule, normalizer: NormalizerInstance, catalogs: Catalogs, provenance: Provenance, pluginVersion: string) {
    this.lib = lib;
    this.normalizer = normalizer;
    this.catalogs = catalogs;
    this.provenance = provenance;
    this.pluginVersion = pluginVersion;
  }

  static async load(skillDir: string): Promise<Engine> {
    const started = Date.now();
    const readJson = async (name: string) => JSON.parse(await readFile(join(skillDir, "assets", name), "utf8"));
    const lib = await import(pathToFileURL(join(skillDir, "scripts", "normalizer.js")).href) as NormalizerModule;
    const [catalogs, training, b3Aliases, chuanHoa2Aliases, provenance] = await Promise.all([
      readJson("catalogs.json"),
      readJson("training.json"),
      readJson("b3-srh-alias.json"),
      readJson("chuan-hoa-2-alias.json"),
      readJson("data-provenance.json").catch(() => ({})),
    ]);
    const pluginVersion = await readFile(join(skillDir, "..", "..", "plugin.json"), "utf8")
      .then(text => String(JSON.parse(text).version ?? ""))
      .catch(() => "");
    const flattenedB3 = (b3Aliases as { Source?: string; Normalized?: Record<string, unknown> }[]).map(row => ({
      "Tên gọi ibom": row.Source ?? "",
      SourceKey: row.Source ?? "",
      ...(row.Normalized ?? {}),
    }));
    const normalizer = new lib.Normalizer({
      ...catalogs,
      Training: training,
      AliasMatrix: [...(catalogs.AliasMatrix ?? []), ...flattenedB3, ...chuanHoa2Aliases],
    });
    log.info("engine.loaded", { ms: Date.now() - started, materials: catalogs.VAT_TU?.length, pluginVersion });
    return new Engine(lib, normalizer, catalogs as Catalogs, provenance as Provenance, pluginVersion);
  }

  fold(value: string): string {
    return this.lib.fold(value);
  }

  splitDimension(value: string): string[] {
    return this.lib.splitErpDimensionValues(value);
  }

  requirements(material: string) {
    return this.normalizer.requirements(material);
  }

  /** Tương đương `node scripts/normalize-materials.mjs`: cùng đầu vào → cùng `items`. */
  normalize(items: InputItem[]): ResultRow[] {
    this.trimMemos();
    const normalizer = this.normalizer;
    const rawResults = this.lib.normalizeMaterialBatch(normalizer, items);
    return rawResults.map((entry, index) => {
      const sourceText = items[index]?.identityText ?? (items[index] as { source?: string } | undefined)?.source ?? "";
      const raw: Record<string, string> = { ...(entry.result ?? {}) };
      const group = raw["Nhóm vật tư"] ?? "";
      const material = raw["Vật tư"] ?? "";
      const requirementSet = material ? normalizer.requirements(material) : { hasMatrix: false, fields: {} as Record<string, boolean> };
      const missingInputs: string[] = [];

      for (const field of MATRIX_COLUMNS) {
        if (requirementSet.hasMatrix && requirementSet.fields[field] && !raw[field]) {
          raw[field] = "thiếu";
          missingInputs.push(field);
        }
      }

      let erpCheck = "";
      if (!group) {
        erpCheck = "Chưa xác định được Nhóm vật tư ERP";
      } else if (!material) {
        erpCheck = "Chưa xác định được Vật tư ERP";
      } else {
        const messages: string[] = [];
        if (missingInputs.length) messages.push(`Chưa đủ thông tin: ${missingInputs.join(", ")}`);
        const erpIssues = [...new Set(entry.erpIssues ?? [])].filter(Boolean);
        if (erpIssues.length) messages.push(`${erpIssues.join(", ")} chưa có trong snapshot đóng gói`);
        erpCheck = messages.join("; ");
      }

      const result = Object.fromEntries(DISPLAY_COLUMNS.map(field => [
        field,
        field === SOURCE_COLUMN
          ? sourceText
          : (raw[field] || ((field === "Nhóm vật tư" || field === "Vật tư") ? "thiếu" : "")),
      ]));
      const matrixRequired = Object.fromEntries(MATRIX_COLUMNS.map(field => [
        field,
        Boolean(requirementSet.hasMatrix && requirementSet.fields[field]),
      ]));

      return {
        row: index + 1,
        source: sourceText,
        "Kiểm tra ERP": erpCheck,
        result,
        matrixRequired,
        sourceDerived: entry.sourceDerived ?? {},
      };
    });
  }

  /** Các Map memo của lõi lớn dần theo số mô tả khác nhau; xả bớt để server chạy lâu không phình RAM. */
  private trimMemos(): void {
    const n = this.normalizer;
    if (n.memo.size + n.aliasMemo.size + n.groupMemo.size + n.materialMemo.size + n.erpIssueMemo.size < MEMO_LIMIT) return;
    for (const memo of [n.memo, n.aliasMemo, n.groupMemo, n.materialMemo, n.erpIssueMemo]) memo.clear();
  }
}
