// Tool MCP với ERP giả lập: kiểm quyền theo grantedPolicies, đối chiếu trực tiếp, xuất file.
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { after, before, describe, it } from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { EVIDENCE } from "../src/core/live.ts";
import { callTool, mcpClient, signIn, startApp, type TestApp } from "./helpers.ts";

let app: TestApp, full: Client, limited: Client;
before(async () => {
  app = await startApp();
  full = await mcpClient(app.base, (await signIn(app.base)).access_token);
  limited = await mcpClient(app.base, (await signIn(app.base, "han.che@hawee.com.vn")).access_token);
});
after(async () => {
  await full.close();
  await limited.close();
  await app.close();
});

describe("danh sách", () => {
  it("đủ 7 tool, tất cả chỉ đọc; 4 resource; 1 prompt", async () => {
    const tools = (await full.listTools()).tools;
    assert.deepEqual(tools.map(t => t.name).sort(), ["chuan_hoa_vat_tu", "kiem_tra_gia_tri", "tim_vat_tu", "toi_la_ai", "trang_thai_du_lieu", "xem_ma_tran", "xuat_file_ket_qua"]);
    assert.ok(tools.every(t => t.annotations?.readOnlyHint === true));
    assert.equal((await full.listResources()).resources.length, 4);
    assert.equal((await full.listPrompts()).prompts[0].name, "chuan_hoa_vat_tu");
    const guide = await full.readResource({ uri: "vt://huong-dan/ra-soat" });
    assert.match((guide.contents[0] as { text: string }).text, /Cổng kiểm định ngữ nghĩa/);
  });
});

describe("toi_la_ai", () => {
  it("trả mã nhân viên và quyền ERP, không lộ token", async () => {
    const r = await callTool(full, "toi_la_ai");
    assert.equal(r.data["Mã nhân viên"], "05923");
    assert.ok(r.data["Quyền vật tư ERP"].includes("Company.Material.CodeRule.Read"));
    assert.ok(!r.data["Quyền vật tư ERP"].includes("Project.Warehouse.Read"), "chỉ giữ quyền danh mục vật tư");
    assert.ok(!/eyJ|access_token|refresh/i.test(r.text));
  });
});

describe("kiểm quyền theo ERP", () => {
  it("thiếu Company.Material.CodeRule.Read → xem_ma_tran bị chặn, không gọi ERP", async () => {
    const before = app.erp.calls.length;
    const r = await callTool(limited, "xem_ma_tran", { vat_tu: "Ống uPVC", nhom_vat_tu: "Ống uPVC & phụ kiện" });
    assert.ok(r.isError);
    assert.match(r.text, /Company\.Material\.CodeRule\.Read/);
    assert.equal(app.erp.calls.length, before);
  });

  it("thiếu quyền xem danh sách giá trị → báo 'không có quyền xem', không báo sai là thiếu", async () => {
    const r = await callTool(limited, "chuan_hoa_vat_tu", { items: [{ identityText: "Ống uPVC D110 PN10 ISO 1452" }] });
    assert.ok(!r.isError, r.text);
    const row = r.data.items[0];
    assert.equal(row.evidence, EVIDENCE.snapshot);
    assert.ok(row.erp.values.every((v: { status: string }) => v.status === "không có quyền xem"));
  });
});

describe("chuan_hoa_vat_tu", () => {
  it("dòng nhận diện được → đối chiếu ERP: ma trận ERP, giá trị có trong ERP", async () => {
    const r = await callTool(full, "chuan_hoa_vat_tu", {
      items: [{ identityText: "Ba chạc vuông uPVC DN90x60" }, { identityText: "Ống uPVC D110 PN10 ISO 1452" }, { identityText: "Co ren DN20" }],
    });
    assert.ok(!r.isError, r.text);
    const [tee, pipe, elbow] = r.data.items;
    assert.equal(tee.result["Vật tư"], "Tê thu uPVC");
    assert.equal(tee.result["Kích thước"], "D90x60");
    assert.deepEqual(tee.erp.values.map((v: { part: string; status: string }) => `${v.part}:${v.status}`), ["D90:có trong ERP", "D60:có trong ERP"]);
    assert.equal(pipe.result["Kích thước"], "D110");
    assert.equal(pipe.result["Quy cách đóng gói"], "cây 4m");
    // Quy cách đóng gói chưa kiểm được qua API → không được nâng lên mức "đầy đủ".
    assert.equal(pipe.evidence, EVIDENCE.matrixOnly);
    assert.equal(pipe["Kiểm tra ERP"], "");
    assert.equal(elbow.evidence, EVIDENCE.snapshot);
    assert.equal(elbow["Kiểm tra ERP"], "Chưa xác định được Nhóm vật tư ERP");
    assert.equal(r.data.summary.rows, 3);
  });

  it("doi_chieu_erp=false → chỉ snapshot, không gọi BIM", async () => {
    const before = app.erp.calls.length;
    const r = await callTool(full, "chuan_hoa_vat_tu", { items: [{ identityText: "Ống uPVC D110 PN10 ISO 1452" }], doi_chieu_erp: false });
    assert.equal(r.data.items[0].evidence, EVIDENCE.snapshot);
    assert.equal(app.erp.calls.length, before);
  });

  it("từ chối đầu vào quá 500 dòng", async () => {
    const r = await callTool(full, "chuan_hoa_vat_tu", { items: Array.from({ length: 501 }, () => ({ identityText: "Ống uPVC D110" })) });
    assert.ok(r.isError);
  });
});

describe("tra cứu trực tiếp", () => {
  it("tim_vat_tu trong đúng nhóm", async () => {
    const r = await callTool(full, "tim_vat_tu", { tu_khoa: "Tê", nhom_vat_tu: "PUP" });
    assert.deepEqual(r.data.items.map((i: Record<string, string>) => i["Vật tư"]), ["Tê thu uPVC"]);
  });

  it("xem_ma_tran đọc cột bắt buộc từ ERP", async () => {
    const r = await callTool(full, "xem_ma_tran", { vat_tu: "Ống luồn dây PVC" });
    assert.ok(!r.isError, r.text);
    assert.deepEqual(r.data["Cột bắt buộc (V)"], ["Nhóm vật tư", "Vật tư", "Kích thước", "Hoàn thiện", "Quy cách đóng gói", "Đơn vị tính", "Hãng sản xuất", "Xuất xứ", "Mã hiệu"]);
    assert.equal(r.data["Bắt buộc theo 7 cột chuẩn hóa"]["Dải thông số kỹ thuật"], false);
  });

  it("kiem_tra_gia_tri: có / chưa gán cho nhóm / chưa có / đang ngưng", async () => {
    const r = await callTool(full, "kiem_tra_gia_tri", { nhom_vat_tu: "Ống uPVC & phụ kiện", kich_thuoc: "DN65x20", hoan_thien: "màu bạc", tieu_chuan: "ISO 1452" });
    const status = Object.fromEntries(r.data.ket_qua.map((v: { part: string; status: string }) => [v.part, v.status]));
    assert.equal(status.DN65, "chưa có trong ERP");
    assert.equal(status.DN20, "chưa gán cho nhóm");
    assert.equal(status["màu bạc"], "đang ngưng");
    assert.equal(status["ISO 1452"], "có trong ERP");
  });
});

describe("xuat_file_ket_qua", () => {
  it("tạo xlsx đúng mẫu Đơn hàng/Nhập kho, link tải dùng được và không cần token", async () => {
    const r = await callTool(full, "xuat_file_ket_qua", {
      mau: "don_hang_nhap_kho",
      dong: [{ "Mô tả hàng hóa của NCC": "Ống uPVC D110 <PN10> & \"ISO\"", "Nhóm vật tư": "Ống uPVC & phụ kiện", "Vật tư": "Ống uPVC", "Quy cách đóng gói": "cây 4m", "Mã nội bộ": "X1" }],
    });
    assert.ok(!r.isError, r.text);
    assert.equal(r.data.cot[10], "ĐV quy đổi");
    assert.equal(r.data.cot.at(-1), "Mã nội bộ");
    const res = await fetch(r.data.download_url);
    assert.equal(res.status, 200);
    const sheet = readZipEntry(Buffer.from(await res.arrayBuffer()), "xl/worksheets/sheet1.xml");
    assert.match(sheet, /Ống uPVC D110 &lt;PN10&gt; &amp; &quot;ISO&quot;/);
    assert.match(sheet, /cây 4m/);
    assert.equal((await fetch(`${r.data.download_url}x`)).status, 404);
  });
});

/** Đọc một file trong ZIP (đủ cho file do buildXlsx tạo). */
function readZipEntry(zip: Buffer, name: string): string {
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26), extra = zip.readUInt16LE(offset + 28);
    const entryName = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extra;
    if (entryName === name) return inflateRawSync(zip.subarray(start, start + size)).toString("utf8");
    offset = start + size;
  }
  throw new Error(`không thấy ${name}`);
}
