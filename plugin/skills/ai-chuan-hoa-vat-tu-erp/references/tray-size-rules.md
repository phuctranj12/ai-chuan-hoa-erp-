# Kích thước máng và phụ kiện

Nguồn: 744 dòng người dùng cung cấp ngày 02/11/2026, lưu nguyên văn ở assets/tray-size-rules-source.tsv. Tra đúng cặp Nhóm vật tư–Vật tư, không suy mẫu chỉ từ Loại vật tư. Không tự thêm tên vật tư vào danh mục nhận diện.

Các mẫu: W, H, WxH, W1/2, W1/2xH, W1/2/3, W1/2/3xH, WxZ, WxHxZ.
W1/2 là hai chiều rộng, W1/2/3 là ba chiều rộng; không phải phép chia. Ví dụ W300/200xH100 và W300/200/100xH100.
Máng kèm nắp dùng mẫu của chính vật tư đó, không áp dụng mẫu nắp rời. Nắp bịt cuối và kẹp nắp cũng tra đúng tên. Tứ chạc thu theo danh sách dùng hai chiều rộng.
Nhận W/H/Z không phân biệt hoa thường, có dấu = hoặc :, dấu phẩy thập phân, các trục đứng rời nhau; nhận W300/200xH100 và W300/W200xH100. Không đưa T hay L vào kích thước.
Thiếu trục, số nhánh không đúng, chiều cao xung đột hoặc đơn vị cm/m chưa được quy đổi: không tự bịa, trả thiếu để AI kiểm tra. Không suy trục từ chuỗi số trần chưa gắn nhãn.
Sau khi AI sửa Nhóm/Vật tư, phải chạy lại quy tắc kích thước cho đúng tên đã sửa. Việc khớp mẫu không chứng minh giá trị kích thước tồn tại trong danh sách ERP hiện tại.
