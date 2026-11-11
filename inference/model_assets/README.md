# Model runtime

Đặt checkpoint tin cậy của nhóm tại `best.pt` trong thư mục này trước khi chạy Compose.
Hoặc đặt `MODEL_FILE` trong `.env` thành đường dẫn tới file `.pt` trên máy bạn.
File này được mount chỉ đọc vào `/models/best.pt` trong container inference.
Trọng số được Git và Docker build context bỏ qua; nhóm chia sẻ riêng checkpoint và SHA-256.
Thiếu file sẽ làm Compose báo lỗi ngay, thay vì tạo một thư mục rỗng tên `best.pt`.
