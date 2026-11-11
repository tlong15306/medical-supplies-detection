# Kiểm tra frontend hiển thị thùng chứa

Ngày kiểm tra: 11/11/2026.

## Source và cách lấy về

- Remote: `https://github.com/tlong15306/medical-supplies-detection.git`.
- Nhánh: `origin/feat/frontend-bin-display`.
- Commit: `3043e59f6c408eda213c3ae77f0f36a9350500bf`.
- Đã `git fetch origin --prune` và checkout detached commit này trong worktree review có sẵn: `C:/Users/choqu/OneDrive/Desktop/PTDACNTT-review-frontend`.
- Review worktree sạch sau kiểm tra. Chưa merge/cherry-pick vào nhánh backend và chưa push thay đổi lên nhánh của thành viên frontend.
- Các thay đổi Docker local trong `PTDACNTT-detection-api-gpu` được giữ nguyên; báo cáo này được thêm vào thư mục docs của worktree đó.

Nhánh mới dựa trên `main` đã chứa backend detection/bin. Diff với main gồm tám file: UI, helper metadata thùng, CSS, mock, README và ba ảnh chụp màn hình.

## Kế hoạch và quá trình

1. Xác nhận trạng thái ba worktree, fetch các remote branch và xác định nhánh mới nhất.
2. Đọc diff, helper `binKey`/`binInfo`, mock và cách state lựa chọn được dùng chung giữa box, dòng kết quả và nhóm thùng.
3. Build đúng Dockerfile của nhánh frontend, sau đó chạy `npm run build` trong container.
4. Chạy frontend review riêng ở 5177, nối vào mạng Docker của backend hiện có bằng `API_PROXY_TARGET=http://api:8080`.
5. Chạy mock lần lượt success/multi/unknown/empty/error ở 5178. Dùng React và JSDOM để kiểm tra tương tác DOM; request multipart được chuyển tới API Vite đang chạy thật.
6. Dùng cùng bộ kiểm tra DOM với ảnh bơm tiêm thật qua frontend 5177 → Gin → FastAPI → GPU. Kiểm tra HTTP thêm bằng script `check-docker.ps1`.
7. Để lại frontend thật ở 5177 và mock scenario multi ở 5178 cho người dùng xem, rồi ghi kết quả tại đây.

Bộ kiểm tra DOM được dựng tạm ngoài repo tại `C:/Users/choqu/AppData/Local/Temp/ptdacntt-fe-review-3043e59/check.cjs`, kết quả JSON ở cùng thư mục. Nó dùng JSDOM 26.1.0 và esbuild/React từ dependency của frontend. Đây là bộ kiểm tra của lượt review, chưa thêm vào CI hay dependency dự án. JSDOM cần bổ sung MessageChannel từ Node để chạy React `act`; đó là thiết lập môi trường kiểm tra.

## Kết quả

### Build và HTTP

| Kiểm tra | Kết quả |
|---|---|
| Docker build `medical-supplies-frontend-review:3043e59` | PASS |
| `tsc --noEmit && vite build` trong container | PASS; Vite 7.3.7 |
| Node trong image frontend của nhánh | 24.22.2; Dockerfile hiện dùng tag trôi `node:24-bookworm-slim` |
| Trang gốc của hai container review | HTTP 200 |
| Proxy 5177 → Gin → FastAPI GPU | HTTP 200, đúng envelope `Status`/`Data` |
| Script smoke kiểm tra class/bin qua 5177 | PASS |
| Review worktree `git diff --check` | PASS, không có thay đổi source local |

### Kiểm tra DOM có request HTTP

| Scenario | Dữ liệu và kết quả |
|---|---|
| success | 1 bơm tiêm, nhãn “Hộp vàng · sắc nhọn”, số lượng ba nhóm `[1, 0, 0]` — PASS |
| multi | 4 detection; hai khẩu trang vẫn riêng biệt; ba nhóm `[1, 2, 1]` — PASS |
| unknown | `bin: null`, thiếu field và mã lạ đều vào “Chưa xác định thùng”; số lượng `[0, 0, 0, 3]` — PASS |
| empty | Danh sách rỗng có thông báo; không còn box/nhóm thùng — PASS |
| error | Mock trả 502; hiển thị thông báo lỗi upstream và không có kết quả cũ — PASS |
| real | Ảnh thật, GPU `cuda:0`, một syringe với `yellow_sharps` — PASS |

Các assertion chung đã qua:

- Request dùng POST, field multipart `image`, frontend không tự đặt Content-Type thiếu boundary.
- Nhãn dữ liệu mô phỏng xuất hiện ở mock và không xuất hiện ở chế độ API thật.
- Nút nhận diện bị vô hiệu khi chưa có ảnh và trong lúc loading; bật lại khi hoàn tất/lỗi.
- Số box và số dòng bằng số detection; tổng số lượng các nhóm bằng tổng detection.
- Tọa độ `left`/`top` phần trăm trong DOM khớp bbox và kích thước ảnh trả về; confidence được nhân 100 và làm tròn một chữ số.
- Click dòng kết quả, box và nút vật thể trong nhóm cập nhật đúng `aria-pressed`, box và nhóm được chọn.
- Chọn ảnh mới xóa box, danh sách và nhóm của kết quả cũ.
- Chọn file sai MIME bị từ chối và không gửi request mới.
- Không ghi nhận React console error hoặc JSDOM error trong các lượt kiểm tra.

Kết quả ảnh thật 640×640:

```json
{
  "class_name": "syringe",
  "confidence": 0.9508109092712402,
  "bbox": [132.5602264404297, 23.0694580078125, 460.73052978515625, 574.7520751953125],
  "bin": "yellow_sharps",
  "device": "cuda:0"
}
```

Các trường trên trích từ response Gin qua proxy frontend. DOM hiển thị confidence `95.1%` và tên thùng đúng theo field `bin`.

## Giới hạn và điểm cần xem thêm

- Công cụ browser trả lỗi `Local browser use is disabled in Work settings`. Chưa tự thao tác upload trong trình duyệt thật; không dùng công cụ khác để vượt cấu hình đó.
- JSDOM kiểm tra DOM/state và request HTTP, không có engine layout/render. Vì vậy chưa xác nhận responsive mobile, vị trí pixel sau khi co ảnh, label sát mép, tràn ngang, focus hiển thị hay thao tác bàn phím thật.
- Đã xem ảnh `frontend/screenshots/multi.jpg` đi kèm nhánh: thể hiện số thứ tự, thùng và liên kết lựa chọn. Đây là ảnh thành viên frontend gửi kèm, không phải screenshot do lượt kiểm tra này tạo ra.
- Chưa phát hiện lỗi chức năng trong phạm vi đã kiểm tra. Trước khi nghiệm thu toàn bộ UI, xem trực tiếp các URL dưới đây trên desktop và màn hình nhỏ; thử ảnh ngang/dọc và label sát mép.
- Dockerfile của nhánh frontend vẫn dùng tag Node trôi. Bộ đóng gói Docker local đã làm trước đó cố định image/digest; khi tích hợp nhánh frontend với bộ Docker đó, giữ cấu hình đã cố định và kiểm tra build lại.

## Mở bản review và dừng khi xong

- Frontend mới dùng API/GPU thật: http://localhost:5177.
- Frontend mới dùng mock nhiều vật: http://localhost:5178. Chọn ảnh bất kỳ hợp lệ, rồi nhấn Nhận diện; mock trả bốn detection minh họa.
- UI Docker 5176 và mock 5175 có sẵn trước review vẫn chạy bản source cũ. Muốn xem nhánh mới ở lượt này, dùng 5177/5178.

Hai container review dùng image độc lập, không sửa cấu hình/source của stack backend. Xem log hoặc dừng chúng bằng:

```powershell
docker logs --tail 50 medical-supplies-frontend-review
docker logs --tail 50 medical-supplies-frontend-review-mock
docker stop medical-supplies-frontend-review medical-supplies-frontend-review-mock
```

Chưa merge, commit hay push thay đổi trong lượt review này.
