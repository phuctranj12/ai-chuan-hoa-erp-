// Lõi trong MCP phải cho kết quả GIỐNG HỆT script gốc của plugin (scripts/normalize-materials.mjs).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { Engine } from "../src/core/engine.ts";
import { SKILL_DIR } from "./helpers.ts";

const DESCRIPTIONS = [
  "Ba chạc vuông uPVC DN90x60", "Co ren DN20", "Ống luồn dây D20 màu trắng", "Ống uPVC D110 PN10 ISO 1452",
  "Ống luồn dây PVC D20", "Ống luồn dây mềm PVC D25", "Cút PPR D25", "Tê thu PPR 32x25", "Ống nước lạnh PPR DN20 PN10",
  "Ống nước nóng PPR D32 PN20", "Măng sông ren trong PPR D20x1/2\"", "Côn thu uPVC D90x60", "Chếch 45 uPVC D110",
  "Van bi đồng ren DN25", "Ống thép mạ kẽm DN50 BS1387", "Cút hàn thép đen DN80 Sch40", "Mặt bích thép DN100 PN16",
  "Máng cáp W300xH100 tôn đen", "Thang cáp W400xH100 sơn tĩnh điện", "Nắp máng W200", "Co ngang máng W300/200xH100",
  "Bulong đầu lục giác, mạ điện, M8, L30", "Dây điện CV 2.5mm2", "Cáp điện CXV 4x16mm2", "Đế âm tường PVC đơn",
  "Keo dán ống uPVC", "Ống HDPE D63 PN10", "Ống gió mềm D150", "Y uPVC D110", "Tê đều uPVC D90", "Kẹp treo ống DN50",
  "Ống luồn dây thép mạ kẽm IMC DN25", "Đèn LED panel 600x600 40W", "", "Ống uPVC không bạc D60",
];

it("cùng đầu vào → cùng kết quả với normalize-materials.mjs của plugin", async () => {
  const items = DESCRIPTIONS.map(text => ({ identityText: text, attributeText: text }));
  items.push({ identityText: "Tê thu", attributeText: "Tê thu uPVC D90x60 PN10", contextGroupHint: "Ống uPVC & phụ kiện" } as never);
  const dir = mkdtempSync(join(tmpdir(), "vt-parity-"));
  try {
    writeFileSync(join(dir, "in.json"), JSON.stringify({ items }));
    execFileSync(process.execPath, [join(SKILL_DIR, "scripts", "normalize-materials.mjs"), join(dir, "in.json"), join(dir, "out.json")]);
    const expected = JSON.parse(readFileSync(join(dir, "out.json"), "utf8")).items;
    const engine = await Engine.load(SKILL_DIR);
    const actual = engine.normalize(items);
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < expected.length; i++) assert.deepEqual(actual[i], expected[i], `dòng ${i + 1}: ${items[i].identityText}`);
    // Gọi lại (memo của lõi đã có dữ liệu) vẫn phải ra như cũ.
    assert.deepEqual(engine.normalize(items), expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
