> Chế độ mặc định 2.0.12: đối chiếu DATA và ma trận đóng gói. Các bước kiểm tra ERP trực tiếp bên dưới chỉ áp dụng khi người dùng yêu cầu; không chặn trả kết quả offline.

# Rà soát kết quả vật tư ERP

## Cột Kiểm tra ERP

- Ô trống: snapshot không phát hiện giá trị thiếu; không đồng nghĩa toàn bộ dòng đã hoàn hảo.
- Dạng cảnh báo: `DN34, PN12, ISO 1452 chưa có trong ERP`.
- Chỉ sinh cảnh báo khi Nhóm vật tư và Vật tư đã nhận diện chắc chắn.
- Ma trận có dấu `V` mới bắt buộc nhập. Nếu thiếu đầu vào, ghi `thiếu` đúng cột và ghi `Chưa đủ thông tin: <tên cột>` trong `Kiểm tra ERP`.
- Khi chưa xác định Nhóm/Vật tư, không được báo DN/PN/tiêu chuẩn chưa có trong ERP.

Kích thước nhiều thành phần được kiểm riêng:

- `DN65x40` kiểm `DN65` và `DN40`.
- `D110x60` kiểm `D110` và `D60`.
- `W200xH50xL300xZ20` kiểm các giá trị `200`, `50`, `300`, `20` theo ma trận nhóm.

## Các bất biến nghiệp vụ

1. Giữ đúng loại danh từ đầu nguồn: Cút, Chếch, Tê, Y, Côn, Bích, Ống, Thanh U, Kẹp, Kép… không được đổi chéo chỉ vì vài từ giống nhau.
2. Giữ đủ nhánh kích thước. Không rút `DN32x25` thành `DN32`; ren inch phải quy đổi đúng khi ERP dùng milimét.
3. `Tê/Y` một kích thước có thể là đều, nhiều kích thước có thể là thu; không áp dụng cho `Y lọc` hoặc từ Y thuộc tên khác.
4. Không biến phủ định thành khẳng định: `không bạc` không thành `màu bạc`; `không chống cháy` không thành `chống cháy`.
5. Ưu tiên cụm danh từ ở đầu mô tả. Ví dụ `Keo dán ống` là keo dán, không phải ống.
6. Ngữ cảnh từ các dòng cùng vùng chỉ được dùng khi dòng hiện tại thiếu vật liệu/hệ sản phẩm và kích thước tương đồng; mô tả rõ ràng trên dòng luôn có ưu tiên cao hơn.
7. Không tự bịa Hãng sản xuất, Xuất xứ hoặc Mã hiệu.

## Cổng kiểm định ngữ nghĩa của AI

Lõi là bộ tạo ứng viên nhanh. Trước khi xuất kết quả, AI phải đọc lại mô tả nguồn và kiểm tra tối thiểu bốn lớp:

1. **Danh từ vật tư:** nguồn `Co ren` không được thành `Cút dài`; `Tê` không được thành `Y`; `Ống` không được thành phụ kiện.
2. **Từ phân loại:** bảo toàn `ren`, `hàn`, `dài`, `đặc`, `thu/giảm`, `đều`, `trong/ngoài`, `mềm/cứng` và phủ định như `không bạc`.
3. **Vật liệu/hệ sản phẩm:** không đổi thép đen sang mạ kẽm, uPVC sang PPR hoặc ống luồn dây PVC sang ống nước chỉ vì tên gần giống.
4. **Thông số đích danh:** mọi DN/D, số nhánh, PN/Sch, tiêu chuẩn và chiều dài đọc rõ từ nguồn phải còn trong trường ERP tương ứng hoặc có phép quy đổi đã xác định.

Nếu một lớp xung đột:

- Không xuất ứng viên lõi như kết quả đúng.
- Tìm lại trong đúng Nhóm ERP bằng cụm danh từ và các từ phân loại được bảo toàn.
- Nếu ERP có tên phù hợp, dùng tên đó rồi đọc lại ma trận/giá trị của chính Vật tư mới.
- Nếu chưa thấy tên phù hợp, ghi `thiếu` tại Vật tư và giải thích xung đột ngoài bảng; không chọn một tên sai họ chỉ để có kết quả.

Ví dụ: `Co ren DN20` trong ngữ cảnh ống thép phải giữ `DN20` và họ `ren`. `Cút dài thép đen` là ứng viên không hợp lệ dù điểm khớp từ khóa cao. AI cần tra nhóm để xác nhận tên `Cút ren trong ...`; nếu danh mục hiện tại chưa có tên tương ứng thì để Vật tư `thiếu`, không quay lại `Cút dài`.

Khi kết quả không chắc chắn, giữ nguyên nguồn, ghi `thiếu` ở trường cần bổ sung và nêu ứng viên thay vì tự tạo Alias.
