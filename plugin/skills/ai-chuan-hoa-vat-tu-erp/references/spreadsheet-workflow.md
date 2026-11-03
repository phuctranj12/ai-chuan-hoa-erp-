> Chế độ mặc định 2.0.12: đối chiếu DATA và ma trận đóng gói. Các bước kiểm tra ERP trực tiếp bên dưới chỉ áp dụng khi người dùng yêu cầu; không chặn trả kết quả offline.

# Chuẩn hóa vật tư trong file

## Phạm vi dữ liệu

Nhận `.xlsx`, `.xls`, `.csv` hoặc bảng người dùng dán vào ChatGPT. Với Chrome Extension, chỉ thao tác trực tiếp khi bảng nằm trong Excel Online; không giả định có quyền với Excel desktop.

Xác định dòng tiêu đề chung của bảng, cột mô tả vật tư và cột thông số kỹ thuật nếu có. Bỏ qua dòng tiêu đề nhóm, dòng trống, dòng tổng cộng và nội dung không phải vật tư. Các dòng cha có thể cung cấp ngữ cảnh nhóm/hệ sản phẩm cho các dòng con nhưng không được ghi đè mô tả rõ ràng trên chính dòng.

## Bộ cột kết quả

Nếu mục đích đầu ra chưa rõ, sau khi đối chiếu vật tư hãy hỏi một lần cho toàn bộ file: `Up định mức` hay `Đơn hàng/Nhập kho`. Không hỏi lại cho từng dòng.

### Đơn hàng/NXK

`Mô tả hàng hóa của NCC | Kiểm tra ERP | Nhóm vật tư | Vật tư | Thông số kỹ thuật khác | Kích thước | Tiêu chuẩn | Dải thông số kỹ thuật | Kiểu lắp đặt | Hoàn thiện | ĐV quy đổi | Hãng sản xuất | Xuất xứ | Mã hiệu`

`ĐV quy đổi` là nhãn hiển thị của trường lõi `Quy cách đóng gói`.

### KL định mức

Phần đầu bộ cột:

`Mô tả hàng hóa của NCC | Kiểm tra ERP | Mã gói | Giai đoạn | Nhóm vật tư | Vật tư | ...`

`Mô tả hàng hóa của NCC` giữ nguyên văn mô tả nguồn của từng dòng. Chỉ chuẩn hóa các trường vật tư. Giữ nguyên Mã gói, Giai đoạn và các cột nghiệp vụ khác của người dùng.

Nếu bộ cột đã tồn tại, tái sử dụng đúng tiêu đề thay vì chèn thêm bộ cột trùng. Tiêu đề luôn đặt trên dòng tiêu đề chung của bảng, không đặt tại dòng đầu của vùng người dùng chọn.

## Chạy lõi đóng gói

Tạo tệp JSON đầu vào có dạng:

```json
{
  "items": [
    {
      "identityText": "Tên/mô tả vật tư",
      "attributeText": "Tên/mô tả vật tư + thông số kỹ thuật",
      "groupHint": "",
      "materialHint": "",
      "contextGroupHint": "",
      "contextMaterialHint": ""
    }
  ]
}
```

Chạy:

```text
node scripts/normalize-materials.mjs <input.json> <output.json>
```

Script không gọi mạng. Nó dùng `assets/catalogs.json`, dữ liệu huấn luyện và Alias đã đóng gói. Giữ đúng thứ tự dòng đầu vào khi ghép kết quả về workbook.

Với mỗi phần tử đầu ra:

- Ghi `result` vào các cột tương ứng; cột `Mô tả hàng hóa của NCC` phải giữ nguyên văn nguồn.
- Chỉ ghi `thiếu` cho trường có dấu `V` trong ma trận nhưng kết quả đang trống. Trường không có dấu `V` để trống và không báo thiếu.
- Nếu chưa xác định Nhóm hoặc Vật tư, ghi cảnh báo tương ứng và không kiểm tra các thuộc tính phía sau.
- Ghép giá trị chưa tồn tại theo dạng `DN34, PN12, ISO 1452 chưa có trong ERP`; nếu mọi kiểm tra đều đạt thì để trống `Kiểm tra ERP`.
- Không ghi các trường nội bộ `sourceDerived` vào workbook.

## Xử lý hàng loạt

- Xử lý toàn bộ vùng dữ liệu trong một lần khi tài nguyên cho phép; nếu cần chia lô, giữ thứ tự và ngữ cảnh dòng liền kề.
- Không gọi giao diện ERP cho từng dòng. Chỉ tra trực tiếp các dòng thiếu, khớp nhiều hoặc người dùng yêu cầu xác nhận.
- Không tô màu toàn bộ vùng kết quả. Người dùng kiểm tra bằng `Kiểm tra ERP` và các ô `thiếu`.
- Trả file mới hoặc bản sao đã chỉnh sửa; không ghi đè file nguồn nếu người dùng chưa yêu cầu.
