# Giao diện nhận diện vật tư

Yêu cầu Node.js 24 hoặc Docker. Từ thư mục gốc dự án, chạy mock độc lập:

```sh
docker build --target development -t ptdacntt-frontend:dev ./frontend
docker run --rm -p 127.0.0.1:5174:5173 -e VITE_USE_MOCK=1 -e VITE_MOCK_SCENARIO=success ptdacntt-frontend:dev
```

Mở http://127.0.0.1:5174 và chọn một trong hai ảnh mẫu `mock/fixtures/landscape.png` hoặc `mock/fixtures/portrait.png`. Khung là dữ liệu mô phỏng, không phải kết quả từ mô hình.

Đổi `VITE_MOCK_SCENARIO` thành `empty` hoặc `error` rồi chạy lại container để thử trạng thái không phát hiện hoặc lỗi. Mock nhận multipart thật, kiểm tra ảnh và chờ 500 ms trước khi trả kết quả hợp lệ.

Kiểm tra bản build trong container:

```sh
docker run --rm ptdacntt-frontend:dev npm run build
```

Chạy trực tiếp từ `frontend/` với Node.js:

```sh
npm ci
VITE_USE_MOCK=1 VITE_MOCK_SCENARIO=success npm run dev
npm run build
```

Trên PowerShell, đặt biến bằng `$env:VITE_USE_MOCK="1"` và `$env:VITE_MOCK_SCENARIO="success"` trước `npm run dev`. Đặt `VITE_USE_MOCK=0` để chuyển `/api` tới Gin; `API_PROXY_TARGET` mặc định là `http://127.0.0.1:8080` khi chạy ngoài Compose. Đặt biến này theo địa chỉ API thực tế trong môi trường container. Khởi động lại Vite sau khi đổi biến.

Các kịch bản mock: `success` (một vật), `multi` (bốn vật, gồm hai khẩu trang và đủ ba thùng), `unknown` (bin null, thiếu và mã lạ), `empty`, `error`. Thay `$env:VITE_MOCK_SCENARIO` rồi khởi động lại Vite để đổi kịch bản. Mock chỉ minh họa và không dùng ảnh để nhận diện thật.

## Bản đóng gói đầy đủ

Từ gốc repo, dùng `docker compose up -d --build --wait --wait-timeout 180` sau khi cấu hình model theo README gốc. Compose build target `runtime`: Node tạo thư mục `dist`, Nginx phục vụ file tĩnh tại cổng 8080 trong container và proxy `/api/` sang Gin. Frontend cùng origin với API, không phải cấu hình địa chỉ FastAPI trong trình duyệt.

Target `development` giữ Vite và mock để phát triển độc lập. `docker compose -f compose.mock.yaml up -d --build --wait` tự chọn target này. Ở bản runtime, `VITE_USE_MOCK=0` được cố định khi build; `API_PROXY_TARGET` được Nginx đọc lúc container khởi động. Nếu thay source, build lại image; nếu chỉ thay upstream trong Compose, tạo lại container.
