---
name: ai-chuan-hoa-vat-tu-erp
description: Chuẩn hóa vật tư theo danh mục ERP Hawee từ mô tả đơn lẻ hoặc file Excel, và tra cứu Nhóm vật tư, Vật tư, thuộc tính, Ma trận quản lý thông số trên giao diện ERP bằng ChatGPT Web hoặc ChatGPT Extension for Chrome. Không dùng cho nhân công, SUM BOQ, MAP BOQ, quản trị Alias hoặc ghi dữ liệu lên ERP.
---

# AI Chuẩn hóa vật tư ERP

Mặc định dùng dữ liệu DATA đóng gói; không chờ MCP, không yêu cầu mở ERP để hoàn tất chuẩn hóa. Bảy danh mục thuộc tính được nhập ngày 02/11/2026; nhóm vật tư và ma trận giữ từ plugin gốc 2.0.7. Không suy ra dữ liệu trực tiếp từ snapshot. Giá trị không tìm thấy phải ghi `chưa có trong snapshot đóng gói`.

Chuẩn hóa vật tư bằng lõi quy tắc và snapshot ERP đóng gói trong skill. Khi cần xác nhận dữ liệu mới nhất, đọc giao diện ERP bằng phiên đăng nhập của chính người dùng. Skill không dùng MCP, `localhost`, Add-in Excel desktop hoặc API ERP.

## Khởi động trong ChatGPT và Claude

Khi người dùng hỏi tên ERP của vật tư, yêu cầu chuẩn hóa mô tả hoặc file, hãy tự dùng skill này. Tìm đường dẫn thư mục skill đã được nền tảng giải nén; mọi đường dẫn scripts/assets/references là tương đối với thư mục skill, không phải thư mục làm việc của người dùng. Không phụ thuộc đường dẫn máy Windows của người tạo.

1. Đọc quy trình dưới đây và references/review-guide.md.
2. Tạo input.json trong vùng làm việc tạm. Mỗi dòng có identityText giữ nguyên mô tả, attributeText chứa mô tả kèm thông số nguồn; không bịa groupHint/materialHint.
3. Chạy Node.js với đường dẫn tuyệt đối đến scripts/normalize-materials.mjs và hai đường dẫn input/output. Script không cần npm install, mạng, API hoặc MCP.
4. Đọc output.json, kiểm định ngữ nghĩa từng dòng, tra assets/catalogs.json khi cần. Không đưa toàn bộ danh mục lớn vào ngữ cảnh; dùng chương trình lọc theo nhóm/tên/giá trị.
5. Trả bảng đúng mười cột bên dưới hoặc file kết quả theo spreadsheet-workflow.md. Nêu bằng chứng snapshot, không tự nhận đã kiểm tra ERP trực tiếp.

Ví dụ đầu vào: `{"items":[{"identityText":"Ba chạc vuông uPVC DN90x60","attributeText":"Ba chạc vuông uPVC DN90x60"}]}`.

## Quy tắc kích thước máng cáp 2.0.13

Đọc references/tray-size-rules.md khi chuẩn hóa máng và phụ kiện. Lõi dùng 744 dòng người dùng cung cấp ngày 02/11/2026, tra theo đúng Nhóm vật tư và Vật tư. Đây là dữ liệu người dùng cung cấp, không phải xác nhận ERP trực tiếp.

## Luồng chuẩn hóa duy nhất

- Mọi đầu vào, kể cả một mô tả trong chat, ảnh, file Excel/CSV hoặc nội dung đọc từ giao diện ERP, đều phải chạy qua `scripts/normalize-materials.mjs` với lõi và snapshot đóng gói trước. Với một mô tả, tạo payload một phần tử; không bỏ qua script.
- Kết quả lõi chỉ là ứng viên ban đầu, không phải kết luận cuối cùng. Sau lõi, AI bắt buộc so sánh lại từng dòng nguồn với kết quả theo [hướng dẫn rà soát](references/review-guide.md), phát hiện xung đột ngữ nghĩa rồi đối chiếu ma trận và danh sách giá trị đóng gói theo [nguồn DATA](references/offline-data.md). Chỉ đọc [ERP trên Chrome](references/erp-browser.md) khi người dùng yêu cầu xác nhận trực tiếp.
- Trình tự bắt buộc là `Lõi đề xuất → AI kiểm định ngữ nghĩa → snapshot đóng gói xác nhận`. Không được bỏ bước AI kiểm định chỉ vì lõi đã trả đủ trường.
- Với file Excel/CSV hoặc nhiều mô tả: đọc [quy trình chuẩn hóa file](references/spreadsheet-workflow.md), dùng chính script đóng gói và ghi kết quả trở lại file.
- Khi đánh giá kết quả, cột `Kiểm tra ERP`, kích thước nhiều nhánh hoặc giá trị phủ định: đọc [hướng dẫn rà soát](references/review-guide.md).
- Khi cần điền `Quy cách đóng gói` từ mặc định nghiệp vụ: đọc [quy cách đóng gói mặc định](references/packaging-defaults.md).

Không nhận các yêu cầu chuẩn hóa nhân công, SUM BOQ, MAP BOQ, tạo/cập nhật Alias, cập nhật tool hoặc tạo/sửa dữ liệu ERP. Nêu rõ giới hạn thay vì mô phỏng chức năng không có trong skill.

## Nguyên tắc bắt buộc

1. Giữ nguyên mô tả nguồn và dữ liệu người dùng. Chỉ ghi vào bộ cột kết quả hoặc file kết quả mới.
2. Danh từ vật tư ở đầu mô tả có ưu tiên cao hơn từ chỉ vật liệu, mục đích sử dụng hoặc từ xuất hiện phía sau.
3. Không kết luận một thông số “chưa có trong ERP” khi chưa nhận diện chắc chắn Nhóm vật tư và Vật tư.
4. `thiếu` là trạng thái cần người dùng kiểm tra, không phải dữ liệu ERP.
5. Snapshot trong skill phục vụ chuẩn hóa hàng loạt. Nếu snapshot khác giao diện ERP hiện tại, dữ liệu đang hiển thị trên ERP là nguồn xác nhận mới hơn; nêu rõ sự khác biệt.
6. Không đọc, sao chép hoặc yêu cầu cookie, token, mật khẩu hay mã phiên. Nếu ERP yêu cầu đăng nhập, để người dùng đăng nhập trực tiếp.
7. Mặc định chỉ đọc ERP. Không bấm Lưu, Tạo mới, Cập nhật, Xóa hoặc Duyệt.
8. Dấu `V` trong ma trận ERP nghĩa là thuộc tính bắt buộc. Nếu nguồn không đủ thông tin, ghi `thiếu` đúng cột bắt buộc; cột không có dấu `V` không được báo `thiếu`.
9. Trong kết quả trả người dùng, tách cột cây `Đối tượng` của ERP thành hai cột `Nhóm vật tư` và `Vật tư`.
10. Không sao chép máy móc kết quả lõi khi mâu thuẫn với mô tả nguồn. AI phải bảo toàn các dấu hiệu đích danh: loại vật tư (`Cút/Co`, `Chếch/Lơi`, `Tê`, `Y`, `Côn`, `Bích`, `Ống`...), kiểu cấu tạo/kết nối (`ren`, `hàn`, `dài`, `đặc`, `thu`, `đều`, `trong`, `ngoài`, `mềm`, `cứng`), vật liệu và kích thước nguồn.
11. Khi lõi làm mất hoặc đổi một dấu hiệu đích danh, loại kết quả đó trước khi trả người dùng. Tìm lại ứng viên phù hợp trong đúng Nhóm ERP; chỉ sửa sang tên tồn tại trên ERP/snapshot. Nếu chưa tìm được tên ERP phù hợp, giữ Nhóm nếu chắc chắn, ghi `thiếu` tại Vật tư và nêu ứng viên cần xác nhận; không dùng một Vật tư sai họ để lấp ô.
12. Kích thước ghi rõ trong nguồn có ưu tiên cao nhất. Ví dụ nguồn `DN20` không được thành `DN15`; `DN32/25` không được mất nhánh `25`. Chỉ được đổi định dạng theo quy ước đã chốt (`DN32/25` → `DN32x25`, inch → DN...) và phải bảo toàn giá trị sau quy đổi.
13. Ví dụ kiểm định: `Co ren DN20` có thể đổi từ đồng nghĩa `Co` sang `Cút`, nhưng phải giữ dấu hiệu `ren`; kết quả `Cút dài ...` bị loại. `Ba chạc vuông uPVC DN90x60` phải giữ hai nhánh và tra ứng viên `Tê thu uPVC`, `D90x60`.
14. Không dùng câu chung chung `Kết nối trình duyệt ERP báo lỗi nên chưa xác nhận được`. Chỉ mô tả lỗi ERP khi công cụ trình duyệt thực sự không mở/đọc được ERP, và phải nêu đúng nguyên nhân quan sát được. Việc bị từ chối tải tệp, không có quyền tải xuống hoặc chưa kiểm tra danh sách giá trị không phải là lỗi kết nối ERP.
15. Phân biệt bắt buộc ba mức bằng chứng:
    - Đã đọc đúng hàng Vật tư trong ma trận nhưng chưa mở danh sách giá trị: ghi `Đã đối chiếu trực tiếp Ma trận quản lý thông số ERP; chưa đối chiếu danh sách giá trị ERP`.
    - Đã đọc đúng hàng ma trận và đã kiểm tra từng giá trị liên quan trong danh sách ERP: ghi `Đã đối chiếu trực tiếp với Ma trận quản lý thông số và danh sách giá trị ERP hiện tại`.
    - Không dùng được công cụ trình duyệt hoặc chưa đọc trực tiếp ERP: ghi `Đối chiếu snapshot đóng gói`.
16. Một giá trị chỉ được gọi là `đã xác nhận trên ERP` khi đã kiểm tra trực tiếp trong danh sách giá trị của đúng Nhóm vật tư/Vật tư. Áp dụng riêng cho từng trường: Kích thước, Dải thông số kỹ thuật, Tiêu chuẩn, Kiểu lắp đặt, Hoàn thiện, Thông số kỹ thuật khác và Quy cách đóng gói. Kết quả do lõi/snapshot trả về không tự động trở thành giá trị đã xác nhận trên ERP.

## Hợp đồng đầu ra bắt buộc

Với mọi câu trả lời chuẩn hóa một hoặc nhiều vật tư trong chat, bảng kết quả chỉ được dùng đúng mười cột sau và đúng thứ tự:

`Mô tả hàng hóa của NCC | Nhóm vật tư | Vật tư | Kích thước | Dải thông số kỹ thuật | Tiêu chuẩn | Kiểu lắp đặt | Hoàn thiện | Thông số kỹ thuật khác | Quy cách đóng gói`

- `Mô tả hàng hóa của NCC` phải giữ nguyên văn mô tả nguồn người dùng hỏi hoặc nội dung tại dòng nguồn; không sửa chính tả, đảo chữ, rút gọn hoặc thay bằng tên chuẩn hóa.
- Chín cột còn lại là bộ cột ERP. Bắt đầu từ các trường trong `result` của `scripts/normalize-materials.mjs`, sau đó áp dụng cổng kiểm định ngữ nghĩa và bằng chứng ERP. Chỉ sửa trường mâu thuẫn khi có căn cứ từ nguồn và tên/giá trị ERP; không tự đổi tên cột, thêm cột hoặc thay bằng bảng “dự kiến”.
- Không tạo các cột riêng như `Cấp chịu lực`, `Mã hiệu`, `Đối tượng`, `Tên đề xuất`, `Nhóm vật tư dự kiến` hay `Vật tư dự kiến`.
- Chỉ đặt một giá trị nguồn vào một trong chín cột ERP khi lõi hoặc ma trận ERP của đúng Vật tư ánh xạ giá trị đó vào cột tương ứng. Không tự gán `Medium duty` vào cột mới và không đưa `ARC25/M1` vào bảng ma trận nếu ERP không quản lý nó trong chín cột này.
- Nếu lõi trả `thiếu` cho trường bắt buộc thì giữ `thiếu`. Các trường không bắt buộc và không có giá trị để trống.
- `matrixRequired`, `sourceDerived` và dữ liệu chẩn đoán chỉ dùng để giải thích, không phải cột đầu ra cho người dùng.

## ChatGPT Web và Extension for Chrome

- Trên ChatGPT Web, nhận file do người dùng tải lên, chuẩn hóa và trả file kết quả để tải xuống.
- Trên ChatGPT Extension for Chrome, có thể đọc tab ERP hoặc Excel Online mà người dùng cho phép.
- Nếu cần ERP, luôn mở một tab mới; không điều hướng, tải lại hoặc đóng tab hiện có của người dùng.
- Extension Chrome không điều khiển Excel desktop. Nếu file đang ở Excel desktop, yêu cầu người dùng tải file lên ChatGPT Web hoặc mở bằng Excel Online.

## Báo cáo kết quả

Nêu ngắn gọn: file/sheet đã xử lý, cột nguồn, số dòng dữ liệu, số dòng nhận diện đủ, số dòng `thiếu`, số dòng có cảnh báo `Kiểm tra ERP`, số dòng bị AI loại do xung đột với nguồn, và đúng một trong ba mức bằng chứng ở nguyên tắc 15. Không nói đã đối chiếu ERP nếu mới dùng lõi/snapshot hoặc mới đọc ma trận mà chưa kiểm tra danh sách giá trị.

Nếu môi trường không thực thi được Node.js, báo rõ hạn chế; không tự nhận đã chạy lõi và không chuyển sang chờ MCP.
