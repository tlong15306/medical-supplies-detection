# Medical Supplies Detection

Ứng dụng nhận diện đồ dùng y tế bằng YOLO11s.

## Công nghệ dự kiến

- Frontend: React + TypeScript.
- Backend API: Go/Gin.
- Inference: Python/FastAPI + PyTorch.
- Model: YOLO11s được bàn giao từ nhóm huấn luyện.

## Kiến trúc

Frontend → Gin → FastAPI → YOLO11s

Kết quả được trả về qua Gin để frontend hiển thị
nhãn, độ tin cậy và bounding box.

## Cấu trúc dự kiến

- frontend/: giao diện người dùng.
- backend/: API và nghiệp vụ bằng Gin.
- inference/: dịch vụ chạy model.
- contracts/: đặc tả API dùng chung.
- docs/: tài liệu dự án.

## Phạm vi ban đầu

- Nhận diện ảnh tải lên và webcam.
- Chưa triển khai đăng nhập hoặc lưu lịch sử.

## Chạy cùng môi trường bằng Docker

Yêu cầu Docker Desktop đang chạy Linux containers. Cấu hình đã cố định cho `linux/amd64`.

### Chạy nhận diện thật trên NVIDIA GPU

1. Trên Windows, bật WSL2 backend và dùng driver NVIDIA hỗ trợ WSL2.
2. Nhận checkpoint tin cậy `best.pt` từ nhóm, đặt tại `inference/model_assets/best.pt`.
3. Tại gốc repo, tạo cấu hình cá nhân và khởi động:

```powershell
Copy-Item .env.example .env
docker compose config -q
docker compose up -d --build --wait --wait-timeout 180
```

Chỉ copy `.env.example` khi chưa có `.env`; giữ cấu hình cá nhân đã có. Nếu model ở nơi khác, sửa `MODEL_FILE` trong `.env`. Compose mount model chỉ đọc.

- Giao diện: http://localhost:5174
- Gin API: http://localhost:8080
- Kiểm tra Gin: http://localhost:8080/health/live
- FastAPI chạy nội bộ; Gin gọi `http://inference:8000`.

Chọn ảnh trên giao diện hoặc gọi `POST /api/v1/detections` trong Postman với field `image` kiểu File.
Backend trả mã thùng ở `Data.detections[].bin`. Việc hiển thị tên thùng trên frontend đang được bàn giao riêng trong [tài liệu frontend](docs/frontend-bin-handoff/README.md).

### Chạy giao diện mock trên máy không có GPU/model

```powershell
docker compose -f compose.mock.yaml up -d --build --wait
```

Mở http://localhost:5175. Chế độ này chỉ chạy frontend và API mock bên trong Vite, có nhãn “Dữ liệu mô phỏng”.
Đặt `VITE_MOCK_SCENARIO=empty` hoặc `error` trong `.env`, rồi chạy lại `docker compose -f compose.mock.yaml up -d` để thử các trạng thái khác.

### Xem log, cập nhật và dừng

```powershell
docker compose ps
docker compose logs -f inference api
docker compose up -d --build --wait --wait-timeout 180
docker compose down
```

Source được copy vào image khi build. Sau khi sửa code hoặc pull code mới, dùng lại lệnh có `--build`.
`restart` chỉ chạy lại image đã build. Dừng mock bằng `docker compose -f compose.mock.yaml down`.

Xem [nhật ký và giải thích Docker](docs/docker-setup.md) để hiểu các file, networking, healthcheck, cache và cách xử lý lỗi.
