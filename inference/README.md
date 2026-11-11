# FastAPI inference trên GPU

Service nội bộ nhận một ảnh, chạy checkpoint YOLO11s và trả JSON. Khi khởi động, service nạp model và warm-up trên `cuda:0`. Uvicorn chỉ bắt đầu nhận request khi bước này thành công.

## Chạy trên Windows

Dùng Python 3.11 và máy có NVIDIA GPU. Tại thư mục gốc repo, tạo môi trường Python riêng và cài bản PyTorch có CUDA trước:

```powershell
py -3.11 -m venv .venv
$inferencePython = ".\.venv\Scripts\python.exe"
& $inferencePython -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121
& $inferencePython -m pip install -r inference/requirements.txt -c inference/constraints.txt
```

Đặt checkpoint `best.pt` tại `inference/model_assets/best.pt` hoặc trỏ `MODEL_PATH` đến file bạn đã có. Chỉ nạp checkpoint từ nguồn tin cậy. File trọng số được Git bỏ qua.

```powershell
$env:MODEL_PATH = "C:\path\to\best.pt"
& $inferencePython -m uvicorn app.main:app --app-dir inference --host 127.0.0.1 --port 8000
```

Dùng một worker để giữ một bản model trong GPU. Cấu hình mặc định dùng đầu vào 640 × 640 cho model, confidence 0.25 và IoU 0.45.

## Gọi API

`POST /predict` nhận `multipart/form-data` với field bắt buộc `image` (JPEG hoặc PNG, tối đa 10 MiB và 20 megapixel). Có thể gửi thêm `confidence_threshold` từ 0 đến 1 và `frame_id` là số nguyên không âm.

```powershell
curl.exe -f -F "image=@C:\path\to\syringe.jpg" -F "frame_id=1" http://127.0.0.1:8000/predict
```

Kết quả gồm `device`, `image`, `processing_ms` và `detections`. Mỗi detection có `class_id`, `class_name`, `confidence` và `bbox_xyxy` tính bằng pixel trên ảnh sau khi chuẩn hóa hướng EXIF. Ảnh không có đối tượng trả HTTP 200 với `detections: []`. Nếu GPU đang phục vụ request khác, API trả HTTP 429.

Xem schema và gửi ảnh thử tại `http://127.0.0.1:8000/docs`.

## Chạy bằng Docker

Tại gốc repo, đặt `best.pt` vào `inference/model_assets/`, tạo `.env` từ `.env.example` nếu chưa có, rồi chạy:

```powershell
docker compose up -d --build --wait --wait-timeout 180
```

Compose cấp một NVIDIA GPU cho service inference, mount model chỉ đọc tại `/models/best.pt` và chờ `GET /health/ready` thành công sau warm-up.
Endpoint inference nằm trong mạng Docker; gửi ảnh qua Gin tại `http://127.0.0.1:8080/api/v1/detections`.
Xem [hướng dẫn và nhật ký đóng gói](../docs/docker-setup.md) để kiểm tra GPU, đổi cổng và theo dõi log.
