# Tra cứu vật tư trên giao diện ERP

## Điều kiện

Chỉ thực hiện khi ChatGPT Extension for Chrome hoặc công cụ trình duyệt được người dùng cho phép. Dùng phiên đăng nhập hiện có nhưng không đọc cookie, token hoặc thông tin xác thực. Mặc định chỉ đọc ERP.

## Xác định tên vật tư Hawee

Trước khi mở hoặc tìm kiếm trên ERP, bắt buộc chạy mô tả qua `scripts/normalize-materials.mjs`, sau đó áp dụng cổng kiểm định ngữ nghĩa trong [hướng dẫn rà soát](review-guide.md). Dùng kết quả lõi làm ứng viên tra cứu, không coi là kết luận. Nếu ứng viên làm mất từ phân loại hoặc thay kích thước đích danh của nguồn, loại ứng viên trước khi tra ERP.

Lõi tách mô tả thành danh từ vật tư chính, vật liệu/hệ sản phẩm, số nhánh và kích thước, tiêu chuẩn, dải thông số, kiểu lắp đặt, hoàn thiện và ngữ cảnh nhóm. Ví dụ `Ba chạc vuông uPVC DN90x60` phải được lõi chuẩn hóa thành `Ống uPVC & phụ kiện | Tê thu uPVC | D90x60` trước khi đối chiếu giao diện.

Mở một tab ERP mới và giữ nguyên tab của người dùng. Tra Nhóm vật tư, Vật tư và ứng viên liên quan. So sánh trong đúng nhóm bằng cả danh từ vật tư, từ phân loại, vật liệu và kích thước; không mặc định kết quả đầu tiên hoặc ứng viên lõi là đúng. Nếu AI đổi ứng viên sau kiểm định, phải đọc ma trận và danh sách giá trị của Vật tư đã đổi. Nếu phiên hết hạn, để người dùng tự đăng nhập rồi tiếp tục.

Các đường dẫn đã biết:

- Nhóm vật tư: `/danh-muc-vat-tu/spec-catalog/discipline`
- Vật tư: `/danh-muc-vat-tu/spec-catalog/item`
- Ma trận thuộc tính: `/danh-muc-vat-tu/tao-ma-moi-gop?tab=code-gen-condition-fields-matrix`

Không đoán URL màn hình khác. Dùng menu/nhãn trên ERP để mở danh mục thuộc tính và danh sách giá trị khi cần.

Nếu công cụ trình duyệt không khả dụng hoặc chưa được phép dùng, dừng ở kết quả lõi và ghi `Đối chiếu snapshot đóng gói`. Không nói ERP bị lỗi, không xóa kết quả đã nhận diện và không thay bằng `Chưa xác nhận`.

Không dùng câu chung chung `Kết nối trình duyệt ERP báo lỗi nên chưa xác nhận được`. Nếu ERP vẫn mở và đọc được nhưng thao tác khác bị chặn (ví dụ tải tệp), đó không phải lỗi kết nối ERP. Chỉ nêu lỗi đã quan sát được và tiếp tục kiểm tra trực tiếp trên giao diện khi còn đọc được.

## Đọc ma trận thuộc tính

ERP hiển thị Nhóm vật tư và Vật tư theo cây trong cột `Đối tượng`. Khi trả kết quả, luôn tách cây này thành hai cột `Nhóm vật tư` và `Vật tư`; không đưa cột `Đối tượng` vào kết quả.

Dấu `V` trong ma trận là thuộc tính bắt buộc:

- Có `V` và nguồn có giá trị hợp lệ: điền giá trị chuẩn ERP.
- Có `V` nhưng nguồn không đủ thông tin: ghi `thiếu` tại đúng cột.
- Không có `V`: không yêu cầu nhập và không ghi `thiếu`. Nếu nguồn cung cấp rõ một giá trị và ERP chấp nhận trường đó, có thể giữ; nếu không thì để trống.
- Không được suy ra dấu `V` từ tên cột. Phải đọc hàng ma trận của đúng Vật tư.

Sau đó bắt buộc kiểm tra từng giá trị kết quả với danh sách giá trị thuộc tính của đúng Nhóm vật tư/Vật tư. Phải kiểm tra riêng từng trường có giá trị: Kích thước, Dải thông số kỹ thuật, Tiêu chuẩn, Kiểu lắp đặt, Hoàn thiện, Thông số kỹ thuật khác và Quy cách đóng gói. Ma trận chỉ cho biết trường nào được quản lý/bắt buộc; nó không tự chứng minh `DN20`, `Sch40`, `ASTM A106`, `màu trắng`, `PN16` hoặc bất kỳ giá trị nào đã tồn tại trong ERP.

Không coi giá trị do lõi hoặc snapshot trả về là đã xác nhận trực tiếp trên ERP. Ví dụ `ASTM A106`, `ASTM A234`, `ASME B1.20.1` và `Sch40` chỉ được ghi là đã xác nhận ERP sau khi đã mở danh sách giá trị tương ứng của đúng Vật tư và quan sát thấy từng giá trị.

## Trạng thái bằng chứng phải báo đúng

- Chỉ đọc lõi/snapshot: `Đối chiếu snapshot đóng gói`.
- Đã đọc hàng ma trận của đúng Vật tư nhưng chưa kiểm tra danh sách giá trị: `Đã đối chiếu trực tiếp Ma trận quản lý thông số ERP; chưa đối chiếu danh sách giá trị ERP`.
- Đã đọc đúng hàng ma trận và kiểm tra mọi giá trị được dùng trong kết quả: `Đã đối chiếu trực tiếp với Ma trận quản lý thông số và danh sách giá trị ERP hiện tại`.

Không nâng trạng thái cho cả dòng nếu mới kiểm tra một phần. Khi chỉ một số trường đã được kiểm tra, liệt kê đích danh trường đã xác nhận và trường còn dùng snapshot.

## Cột Kiểm tra ERP

- Để trống khi đã xác định đúng Nhóm/Vật tư, đủ thuộc tính bắt buộc và mọi giá trị đều tồn tại trong ERP.
- Nếu thiếu đầu vào cho trường bắt buộc: `Chưa đủ thông tin: Hoàn thiện` đồng thời ô Hoàn thiện ghi `thiếu`.
- Nếu giá trị nguồn chưa có trong ERP: `DN34, PN12, ISO 1452 chưa có trong ERP`.
- Nếu chưa xác định Nhóm: `Chưa xác định được Nhóm vật tư ERP`.
- Nếu đã có Nhóm nhưng chưa xác định Vật tư: `Chưa xác định được Vật tư ERP`.
- Khi chưa xác định Nhóm/Vật tư, không kiểm tra và không báo thiếu kích thước, dải hoặc tiêu chuẩn.

## Định dạng trả lời bắt buộc

Nêu ngắn gọn trạng thái khớp và lý do chọn, sau đó trả một hàng ngang theo đúng thứ tự:

`Mô tả hàng hóa của NCC | Nhóm vật tư | Vật tư | Kích thước | Dải thông số kỹ thuật | Tiêu chuẩn | Kiểu lắp đặt | Hoàn thiện | Thông số kỹ thuật khác | Quy cách đóng gói`

Không trả ma trận theo dạng `Thuộc tính | Có/Không`, không thêm hàng mô tả `Có quản lý`, và không bịa giá trị chưa quan sát được. Ví dụ hợp lệ:

| Mô tả hàng hóa của NCC | Nhóm vật tư | Vật tư | Kích thước | Dải thông số kỹ thuật | Tiêu chuẩn | Kiểu lắp đặt | Hoàn thiện | Thông số kỹ thuật khác | Quy cách đóng gói |
|---|---|---|---|---|---|---|---|---|---|
| Ống luồn dây D20 màu trắng | Ống luồn dây PVC & phụ kiện | Ống luồn dây PVC | DN20 |  |  |  | màu trắng |  | cây 2.92m |

Dùng [quy cách đóng gói mặc định](packaging-defaults.md) khi nguồn không ghi quy cách. Nếu chưa mở được đúng ma trận hoặc danh sách giá trị, ghi rõ phần chưa xác nhận thay vì trình bày suy đoán như dữ liệu ERP.

## Chọn mẫu đầu ra

Sau khi người dùng đã xem kết quả đối chiếu, hỏi một lần cho toàn bộ danh sách:

> Bạn muốn sử dụng kết quả để: 1) Up định mức, hay 2) Làm đơn hàng/Nhập kho?

Không hỏi lại nếu mục đích đã rõ trong yêu cầu. Sau câu trả lời, điền đúng mẫu đã chốt trong [quy trình chuẩn hóa file](spreadsheet-workflow.md). Không tự thay đổi thứ tự cột. Chỉ tạo và trả mẫu/file; không tự ghi lên ERP.

## Giới hạn quyền

Không bấm Tạo mới, Sửa, Lưu, Xóa, Duyệt hoặc cập nhật ma trận. Nếu người dùng yêu cầu thay đổi ERP, giải thích skill này không có chức năng ghi ERP.
