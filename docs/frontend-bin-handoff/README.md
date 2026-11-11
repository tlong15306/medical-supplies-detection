# Bàn giao frontend — hiển thị thùng chứa cho từng vật thể

## Mục tiêu

Cập nhật giao diện MEDSCAN để mỗi vật thể được nhận diện có thêm thùng chứa đề xuất. Backend đã nhận diện ảnh bằng YOLO11s và ánh xạ loại rác sang mã thùng. Frontend dùng mã thùng để hiển thị tên tiếng Việt, màu và icon.

Phạm vi lần này là ảnh JPG/PNG tải lên, gồm ảnh có một hoặc nhiều vật thể. Video và webcam là các bước phát triển tiếp theo.

Tài liệu dùng quy tắc phân loại `demo_v1` do nhóm dự án thống nhất. Tên vật phẩm trong bộ dữ liệu được hiểu theo ngữ cảnh chất thải của demo.

## Nội dung thư mục

- `README.md` — yêu cầu, hợp đồng API, kế hoạch và điều kiện nghiệm thu.
- `mockup.html` — màn hình minh họa tương tác. Mở bằng trình duyệt, chọn một vật thể hoặc dòng kết quả để xem liên kết với box và thùng chứa. Biểu tượng vật thể, confidence và tọa độ trong mẫu là dữ liệu minh họa.

Mockup thể hiện cách tổ chức thông tin. Khi triển khai, giữ ảnh thật, phần chọn ảnh và nút nhận diện của giao diện hiện tại. Một số biểu tượng trong bản xem có thể cần kết nối Internet để tải tài nguyên hiển thị.

## Trạng thái source và phối hợp Git

- Backend tích hợp inference và `bin` đang ở nhánh `feat/detection-api-gpu` tại thời điểm bàn giao.
- Frontend hiện có tải ảnh, vẽ bounding box, hiển thị nhãn/confidence, mock API và Dockerfile.
- Frontend hiện chưa đọc hoặc hiển thị `bin`; mock API hiện cũng chưa có field này.
- Tạo nhánh frontend riêng, đề xuất `feat/frontend-bin-display`, từ `main` mới nhất. Chạy mock để phát triển độc lập; lúc kiểm thử tích hợp thì kết nối tới backend chạy nhánh GPU.
- Trước khi đổi request/response, hai bên cần thống nhất hợp đồng. Các key phân biệt chữ hoa, chữ thường.

## Hợp đồng API

### Request

`POST /api/v1/detections`

Body là `multipart/form-data`, field bắt buộc `image`, kiểu File. Giữ luồng gửi `FormData` đang có và để trình duyệt tạo header Content-Type cùng boundary.

Giới hạn giao diện đang dùng là 10 MiB; hỗ trợ JPG/PNG.

### Response thành công

HTTP `200`, JSON có `Status: "success"` và `Data`.

Ví dụ dưới đây mô phỏng một ảnh 640 × 640 chứa bốn vật thể:

```json
{
  "Status": "success",
  "Data": {
    "image_width": 640,
    "image_height": 640,
    "device": "cuda:0",
    "processing_ms": 180.5,
    "detections": [
      {
        "class_id": 0,
        "class_name": "syringe",
        "confidence": 0.951,
        "bbox": [30, 40, 260, 280],
        "bin": "yellow_sharps"
      },
      {
        "class_id": 5,
        "class_name": "mask",
        "confidence": 0.963,
        "bbox": [350, 50, 590, 270],
        "bin": "yellow_infectious"
      },
      {
        "class_id": 4,
        "class_name": "gloves",
        "confidence": 0.942,
        "bbox": [40, 350, 280, 590],
        "bin": "yellow_infectious"
      },
      {
        "class_id": 6,
        "class_name": "medicine",
        "confidence": 0.907,
        "bbox": [360, 360, 590, 600],
        "bin": "black_hazardous"
      }
    ]
  }
}
```

- `bbox` là `[x1, y1, x2, y2]` theo pixel của ảnh có kích thước `image_width`, `image_height` do backend trả về.
- `confidence` là số từ 0 đến 1; nhân 100 để hiển thị phần trăm.
- `bin` là mã thùng của từng detection, kiểu string hoặc null.
- Ảnh không phát hiện vật thể trả `detections: []`.
- `device` và `processing_ms` là metadata bổ sung. Không bắt buộc thêm chúng vào giao diện ở yêu cầu này.

### Response lỗi

Giữ cách đọc lỗi của frontend hiện tại: nếu HTTP status không thành công, đọc `Error` để hiển thị. Backend còn có `Code` để phân biệt loại lỗi.

```json
{
  "Error": "Failed to get prediction from inference service",
  "Code": "ERR_INTERNAL_SERVER"
}
```

Không dùng field `bin` để suy luận trạng thái thành công hay thất bại của toàn request.

## Quy tắc trình bày thùng

| Mã backend trả | Tên hiển thị | Trình bày |
|---|---|---|
| `yellow_sharps` | Hộp vàng · sắc nhọn | Màu vàng, icon hộp/cảnh báo; có thể thêm chú thích “Thành cứng” |
| `yellow_infectious` | Thùng vàng · lây nhiễm | Màu vàng, icon sinh học |
| `black_hazardous` | Thùng đen · nguy hại | Màu đen, icon cảnh báo |
| null, thiếu field hoặc mã chưa hỗ trợ | Chưa xác định thùng | Kiểu trung tính, không gán mặc định vào ba nhóm trên |

Hai nhóm màu vàng phải được phân biệt bằng tên và icon. Không chỉ dùng màu để truyền đạt ý nghĩa.

Frontend ánh xạ **mã thùng → thông tin trình bày**. Bảng **class_name → mã thùng** thuộc backend. Nếu backend trả một mã thùng khác với dự đoán từ tên vật phẩm, giao diện dùng mã `bin` thực tế nhận được.

## Thiết kế màn hình

```text
┌─────────────────────────────┬───────────────────────────────┐
│ Ảnh đã chọn                 │ Kết quả nhận diện             │
│                             │                               │
│ [#1 Bơm tiêm · 95,1%]       │ #1 Bơm tiêm           95,1%   │
│ → Hộp vàng · sắc nhọn       │ → Hộp vàng · sắc nhọn         │
│                             │                               │
│ [#2 Khẩu trang · 96,3%]     │ #2 Khẩu trang         96,3%   │
│ → Thùng vàng · lây nhiễm    │ → Thùng vàng · lây nhiễm      │
│                             │                               │
│ [Các box #3, #4...]         │ [Các kết quả #3, #4...]       │
├─────────────────────────────┴───────────────────────────────┤
│ Phân nhóm thùng chứa                                        │
│ Hộp vàng: #1     Thùng vàng: #2, #3     Thùng đen: #4        │
└─────────────────────────────────────────────────────────────┘
```

### Trên ảnh

- Giữ ảnh thật và cách quy đổi box theo kích thước ảnh hiện tại.
- Gắn số thứ tự #1, #2... cho từng detection, tương ứng danh sách kết quả trong cùng ảnh.
- Nhãn box hiển thị tên vật phẩm, confidence và tên thùng rút gọn.
- Cho phép xuống dòng, điều chỉnh vị trí nhãn khi sát mép để tránh tràn ảnh.
- Các detection trùng class vẫn có box và số thứ tự riêng. Số thứ tự chỉ dùng trong kết quả ảnh hiện tại.

### Danh sách kết quả

- Mỗi dòng gồm số thứ tự, tên vật phẩm, confidence và thùng đề xuất.
- Chọn một dòng sẽ làm nổi bật box tương ứng và nhóm thùng của vật đó. Có thể chọn box để thực hiện cùng thao tác.
- Dùng native button hoặc điều khiển truy cập được bằng bàn phím, có trạng thái lựa chọn rõ ràng.
- Khi đổi ảnh hoặc nhận kết quả mới, đặt lại lựa chọn cũ.

### Nhóm thùng

- Hiển thị ba nhóm đã biết và gom các detection theo giá trị `bin`.
- Số lượng là số detection thuộc nhóm trong ảnh, không gộp các vật cùng class thành một.
- Nhóm không có detection hiển thị số 0 và trạng thái rỗng.
- Chỉ thêm nhóm “Chưa xác định thùng” khi có detection thuộc nhóm này.
- Ảnh không có detection tiếp tục dùng trạng thái “Không phát hiện vật tư”; không hiển thị phân nhóm của kết quả cũ.

## Kế hoạch thay đổi frontend

### 1. Kiểu dữ liệu và helper trình bày

Bổ sung vào `Detection` trong `frontend/src/main.tsx`, hoặc nơi đặt type nếu tách riêng:

```ts
bin?: string | null
```

Tạo một bảng metadata cho ba mã đã biết và helper lấy thông tin hiển thị. Helper phải xử lý cả null, field bị thiếu và mã chưa hỗ trợ, dùng chung cho nhãn box, danh sách và phần nhóm thùng.

Việc gom nhóm và đếm dựa trên mã nhận từ backend; không suy ra thùng từ `class_id` hoặc `class_name`.

### 2. Giao diện và trạng thái

Cập nhật `frontend/src/main.tsx` và `frontend/src/style.css` để hiển thị các phần ở thiết kế trên. Giữ flow chọn ảnh, giới hạn dung lượng, gửi request, hủy request cũ, loading và lỗi hiện có.

Trên màn hình nhỏ, ảnh nằm trên danh sách; các nhóm thùng xếp dọc. Nội dung nhãn và tên file được xuống dòng, không tạo cuộn ngang toàn trang.

### 3. Mock API

Cập nhật `frontend/mock/detection.ts` để có field `bin`. Giữ các scenario hiện tại và bổ sung khả năng thử:

- Một vật thể có mã thùng hợp lệ.
- Nhiều vật thể thuộc cả ba loại thùng.
- Hai vật cùng class/thùng nhưng có box khác nhau.
- `bin: null`, thiếu `bin` và mã chưa biết.
- Không có detection và upstream báo lỗi.

Mọi chế độ mock đều phải hiển thị nhãn “Dữ liệu mô phỏng”.

## Cách chạy để kiểm tra

Yêu cầu Node.js 24. Tại thư mục `frontend` của checkout đang review:

```powershell
npm.cmd ci
$env:VITE_USE_MOCK = "1"
$env:VITE_MOCK_SCENARIO = "success"
npm.cmd run dev -- --port 5174 --strictPort
```

Mở `http://localhost:5174`. Khởi động lại Vite khi thay biến môi trường. Các scenario mới sẽ được frontend bổ sung theo kế hoạch ở trên.

Để thử API thật, backend cần bật sẵn FastAPI ở 8000 và Gin ở 8081. Trong terminal frontend, dừng Vite rồi chạy:

```powershell
$env:VITE_USE_MOCK = "0"
$env:API_PROXY_TARGET = "http://127.0.0.1:8081"
npm.cmd run dev -- --port 5174 --strictPort
```

Nếu Gin dùng cổng khác, đặt `API_PROXY_TARGET` theo địa chỉ thực tế. Không ghi cố định địa chỉ máy riêng của thành viên vào source.

## Checklist nghiệm thu

- [ ] `npm.cmd run build` thành công.
- [ ] Hiển thị đúng tên thùng cho cả ba mã đã biết.
- [ ] Hai nhóm màu vàng được phân biệt bằng chữ và icon.
- [ ] Null, thiếu field và mã lạ hiển thị “Chưa xác định thùng”.
- [ ] Một ảnh nhiều vật có thùng riêng cho mỗi detection.
- [ ] Nhiều vật cùng class vẫn có box, số thứ tự và dòng kết quả riêng.
- [ ] Tổng số detection theo nhóm khớp danh sách; không tự chọn một thùng chung cho cả ảnh.
- [ ] Chọn kết quả làm nổi bật đúng box và nhóm thùng.
- [ ] Ảnh ngang, ảnh dọc và thay đổi kích thước giao diện vẫn căn box đúng.
- [ ] Nhãn sát mép ảnh không tràn hoặc bị cắt mất thông tin chính.
- [ ] Thay ảnh hoặc nhận kết quả mới xóa lựa chọn và nhóm thùng cũ.
- [ ] Loading, lỗi và danh sách rỗng vẫn hoạt động.
- [ ] Có thể dùng bàn phím và giao diện không tràn ngang trên màn hình nhỏ.
- [ ] API thật trả `syringe` với `bin: "yellow_sharps"` thì giao diện hiển thị đúng.

## Mốc commit và bàn giao lại

Sau khi hoàn thành mock và build, commit phần frontend với message đề xuất:

```text
feat: display disposal bins for detected medical waste
```

Push nhánh frontend, mở PR và đính kèm ảnh chụp giao diện một vật/nhiều vật, trường hợp chưa xác định thùng cùng kết quả build. Chạy kiểm thử API thật với backend trước khi nghiệm thu tích hợp.
