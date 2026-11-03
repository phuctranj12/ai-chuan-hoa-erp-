import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Normalizer, normalizeMaterialBatch } from "./normalizer.js";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  throw new Error("Cách dùng: node scripts/normalize-materials.mjs <input.json> <output.json>");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const assetDir = join(scriptDir, "..", "assets");
const readJson = async name => JSON.parse(await readFile(join(assetDir, name), "utf8"));

const [catalogs, training, b3Aliases, chuanHoa2Aliases, payloadText] = await Promise.all([
  readJson("catalogs.json"),
  readJson("training.json"),
  readJson("b3-srh-alias.json"),
  readJson("chuan-hoa-2-alias.json"),
  readFile(resolve(inputArg), "utf8"),
]);
const payload = JSON.parse(payloadText);

const items = Array.isArray(payload) ? payload : payload.items;
if (!Array.isArray(items)) throw new Error("Đầu vào phải là một mảng hoặc object có mảng items.");
if (items.length > 5000) throw new Error("Mỗi lần xử lý tối đa 5.000 dòng.");

const flattenedB3 = b3Aliases.map(row => ({
  "Tên gọi ibom": row.Source ?? "",
  SourceKey: row.Source ?? "",
  ...(row.Normalized ?? {}),
}));
const normalizer = new Normalizer({
  ...catalogs,
  Training: training,
  AliasMatrix: [...(catalogs.AliasMatrix ?? []), ...flattenedB3, ...chuanHoa2Aliases],
});

const matrixColumns = [
  "Kích thước",
  "Dải thông số kỹ thuật",
  "Tiêu chuẩn",
  "Kiểu lắp đặt",
  "Hoàn thiện",
  "Thông số kỹ thuật khác",
  "Quy cách đóng gói",
];
const sourceColumn = "Mô tả hàng hóa của NCC";
const displayColumns = [sourceColumn, "Nhóm vật tư", "Vật tư", ...matrixColumns];
const rawResults = normalizeMaterialBatch(normalizer, items);

const results = rawResults.map((entry, index) => {
  const sourceText = items[index]?.identityText ?? items[index]?.source ?? "";
  const raw = { ...(entry.result ?? {}) };
  const group = raw["Nhóm vật tư"] ?? "";
  const material = raw["Vật tư"] ?? "";
  const requirementSet = material ? normalizer.requirements(material) : { hasMatrix: false, fields: {} };
  const missingInputs = [];

  for (const field of matrixColumns) {
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
    const messages = [];
    if (missingInputs.length) messages.push(`Chưa đủ thông tin: ${missingInputs.join(", ")}`);
    const erpIssues = [...new Set(entry.erpIssues ?? [])].filter(Boolean);
    if (erpIssues.length) messages.push(`${erpIssues.join(", ")} chưa có trong snapshot đóng gói`);
    erpCheck = messages.join("; ");
  }

  const result = Object.fromEntries(displayColumns.map(field => [
    field,
    field === sourceColumn
      ? sourceText
      : (raw[field] || ((field === "Nhóm vật tư" || field === "Vật tư") ? "thiếu" : "")),
  ]));
  const matrixRequired = Object.fromEntries(matrixColumns.map(field => [
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

await writeFile(resolve(outputArg), `${JSON.stringify({
  schemaVersion: "2.1.0",
  count: results.length,
  items: results,
}, null, 2)}\n`, "utf8");
