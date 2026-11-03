import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, sha256 } from "../src/store/crypto.ts";
import { redirectAllowed } from "../src/oauth/provider.ts";
import { applyLiveReport, EVIDENCE } from "../src/core/live.ts";
import type { Config } from "../src/config.ts";
import type { ResultRow } from "../src/core/engine.ts";

describe("mã hoá token ERP", () => {
  const key = randomBytes(32);
  it("giải mã đúng bản đã mã hoá", () => {
    assert.equal(decrypt(key, encrypt(key, "token-erp", "s1:access"), "s1:access"), "token-erp");
  });
  it("bản mã bị sửa, sai khoá, hoặc chép sang bản ghi khác → không giải mã được", () => {
    const sealed = encrypt(key, "token-erp", "s1:access");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("x" + Buffer.from(parts[3], "base64url").toString("latin1")).toString("base64url");
    assert.throws(() => decrypt(key, parts.join("."), "s1:access"));
    assert.throws(() => decrypt(randomBytes(32), sealed, "s1:access"));
    assert.throws(() => decrypt(key, sealed, "s2:access"));
  });
  it("hai lần mã hoá cùng nội dung cho bản mã khác nhau", () => {
    assert.notEqual(encrypt(key, "a", "x"), encrypt(key, "a", "x"));
    assert.equal(sha256("a").length, 64);
  });
});

describe("redirect_uri cho phép", () => {
  const config = { allowedRedirectUris: ["https://claude.ai/api/mcp/auth_callback", "loopback"] } as Config;
  it("khớp chính xác hoặc loopback http", () => {
    assert.ok(redirectAllowed(config, "https://claude.ai/api/mcp/auth_callback"));
    assert.ok(redirectAllowed(config, "http://127.0.0.1:33418/callback"));
    assert.ok(redirectAllowed(config, "http://localhost:6274/oauth/callback"));
  });
  it("từ chối biến thể nguy hiểm", () => {
    for (const uri of ["https://claude.ai/api/mcp/auth_callback/../x", "https://claude.ai.evil.com/api/mcp/auth_callback",
      "https://localhost/callback", "http://127.0.0.1.evil.com/cb", "https://claude.ai/api/mcp/auth_callback#x", "javascript:alert(1)", "khong-phai-url"]) {
      assert.ok(!redirectAllowed(config, uri), uri);
    }
  });
});

describe("áp kết quả đối chiếu ERP", () => {
  const row: ResultRow = {
    row: 1, source: "Ống uPVC D34 PN12", "Kiểm tra ERP": "D34, PN12 chưa có trong snapshot đóng gói",
    result: { "Mô tả hàng hóa của NCC": "Ống uPVC D34 PN12", "Nhóm vật tư": "Ống uPVC & phụ kiện", "Vật tư": "Ống uPVC", "Kích thước": "D34", "Dải thông số kỹ thuật": "PN12", "Tiêu chuẩn": "thiếu", "Kiểu lắp đặt": "", "Hoàn thiện": "", "Thông số kỹ thuật khác": "", "Quy cách đóng gói": "cây 4m" },
    matrixRequired: { "Kích thước": true, "Dải thông số kỹ thuật": true, "Tiêu chuẩn": true, "Kiểu lắp đặt": false, "Hoàn thiện": false, "Thông số kỹ thuật khác": false, "Quy cách đóng gói": true },
    sourceDerived: {},
  };
  it("ma trận ERP không còn bắt buộc Tiêu chuẩn → bỏ 'thiếu'; giá trị chưa có trong ERP được nêu", () => {
    const out = applyLiveReport(row, {
      evidence: EVIDENCE.matrixOnly, matrixChanges: [], notes: [],
      required: ["Nhóm vật tư", "Vật tư", "Kích thước", "Dải thông số kỹ thuật", "Quy cách đóng gói"],
      values: [
        { column: "Kích thước", value: "D34", part: "D34", status: "chưa có trong ERP" },
        { column: "Dải thông số kỹ thuật", value: "PN12", part: "PN12", status: "chưa gán cho nhóm" },
      ],
    });
    assert.equal(out.result["Tiêu chuẩn"], "");
    assert.equal(out.matrixRequired["Tiêu chuẩn"], false);
    assert.equal(out["Kiểm tra ERP"], "D34 chưa có trong ERP; PN12 có trong ERP nhưng chưa gán cho nhóm này");
  });
  it("ma trận ERP bắt buộc thêm Hoàn thiện mà nguồn không có → 'thiếu'", () => {
    const out = applyLiveReport(row, {
      evidence: EVIDENCE.matrixOnly, matrixChanges: [], notes: [], values: [],
      required: ["Kích thước", "Dải thông số kỹ thuật", "Tiêu chuẩn", "Hoàn thiện", "Quy cách đóng gói"],
    });
    assert.equal(out.result["Hoàn thiện"], "thiếu");
    assert.equal(out["Kiểm tra ERP"], "Chưa đủ thông tin: Tiêu chuẩn, Hoàn thiện");
  });
  it("không kiểm được giá trị (thiếu quyền) → giữ cảnh báo snapshot", () => {
    const out = applyLiveReport(row, {
      evidence: EVIDENCE.snapshot, matrixChanges: [], notes: [],
      values: [{ column: "Kích thước", value: "D34", part: "D34", status: "không có quyền xem" }],
    });
    assert.match(out["Kiểm tra ERP"], /D34, PN12 chưa có trong snapshot đóng gói/);
  });
});
