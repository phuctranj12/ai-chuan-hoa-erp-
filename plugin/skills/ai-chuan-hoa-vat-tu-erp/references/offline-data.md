# Dữ liệu ERP đóng gói

Không gọi MCP. `assets/catalogs.json` là nguồn chạy lõi. Các file All*.json lưu đủ hàng gốc để kiểm tra trạng thái; lõi chỉ dùng hàng Kích hoạt. Xem `assets/data-provenance.json` để kiểm tra nguồn và SHA256.

- AllSizes → KICH_THUOC: đối chiếu Mô tả, Nhóm vật tư, inch và kích thước danh nghĩa; không bỏ quan hệ nhóm.
- AllRanges → DAI_THONG_SO: đối chiếu Mô tả theo Nhóm vật tư.
- AllSpecifications → TIEU_CHUAN; AllFinishes → HOAN_THIEN; AllInstallType → KIEU_LAP_DAT.
- AllOrigins → XUAT_XU; AllInstallationSpaces → KHONG_GIAN_LAP_DAT: dành cho tra cứu và cột nghiệp vụ tương ứng. Không gộp Không gian lắp đặt vào Kiểu lắp đặt, không thêm cột vào bảng chat 10 cột.

Nhóm vật tư, Vật tư, ma trận bắt buộc, quy cách đóng gói và dữ liệu học giữ từ snapshot nền. Bảy file DATA không cung cấp bản cập nhật các mục này. Không suy ra quan hệ vật tư/thuộc tính mà file không có.

Chạy: `node scripts/normalize-materials.mjs input.json output.json`. Đầu vào: `{"items":[{"identityText":"Co ren DN20","attributeText":"Co ren DN20"}]}`. Sau khi chạy bắt buộc AI rà soát từng dòng theo review-guide.md. Việc giá trị tồn tại trong danh sách chung không chứng minh phù hợp mọi vật tư.
