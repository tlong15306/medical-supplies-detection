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

docker compose -f docker-compose.yaml up -d