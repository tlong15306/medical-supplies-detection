# Webcam MedScan: quá trình triển khai và giải thích

Ngày triển khai: 17/11/2026. Tài liệu ghi lại yêu cầu, cơ sở lựa chọn thiết kế, luồng code và bằng chứng kiểm thử để có thể đọc lại cùng source.

## 1. Bài toán và tiêu chí

Ứng dụng trước đây chỉ nhận ảnh tải lên. Người dùng phải chọn ảnh rồi bấm nhận diện. Với webcam, đầu vào thay đổi liên tục, nên ngoài gọi API còn phải quản lý camera, tốc độ gửi và tuổi của kết quả.

Phạm vi được duyệt: camera mặc định của laptop, chạy local, nhận diện liên tục, box nằm trên video live. Số lượng là số vật thể trong khung vừa được xử lý; không cộng dồn qua các khung. Ví dụ một bơm tiêm nằm trước camera trong 10 giây vẫn là một vật thể trong mỗi kết quả, không phải hàng chục bơm tiêm.

Box trên video live có độ trễ: server trả kết quả cho khung đã chụp, trong khi video đã chuyển sang thời điểm mới. Bản này không có tracking để dự đoán chuyển động. Vì vậy giao diện nêu rõ độ trễ và tự bỏ kết quả quá cũ.

## 2. Khảo sát trước khi sửa

Các nguồn sở hữu hành vi được đọc trực tiếp:

- React hiện gọi `POST /api/v1/detections`, gửi field `image`, dùng kích thước ảnh để quy đổi box sang phần trăm.
- Gin đi qua handler → service → inference client; service bổ sung thùng chứa bằng `resolveBin`.
- FastAPI có `/predict`, nạp model và warm-up một lần khi khởi động. Một khóa `Lock` bảo vệ model; request tới lúc model bận nhận 429.
- Client Gin có timeout 10 giây. Trước thay đổi, lỗi upstream bị gom thành 500 tại handler, nên frontend không phân biệt được model bận với lỗi nội bộ.
- Frontend qua Nginx proxy cùng origin khi chạy Compose. Camera sẽ được trình duyệt mở; container inference chỉ nhận ảnh, không cần gắn webcam USB vào Docker.

Từ đây chọn tái sử dụng HTTP multipart hiện có. Điểm mới chủ yếu nằm ở frontend và việc phân loại lỗi ở Gin. Chưa cần thêm WebSocket, database, endpoint video hoặc worker chạy model khác.

## 3. Thứ tự thực hiện và lý do

### Chặng 1: sửa cách truyền lỗi từ inference lên giao diện

Trong `backend/internal/client/inference/client.go`, thêm `UpstreamError` có `Status` và `Cause`. `Unwrap()` trả lại nguyên nhân để `errors.Is`/`errors.As` tiếp tục hoạt động.

Lớp service vốn bọc lỗi bằng `fmt.Errorf("detect image: %w", err)`. `%w` bảo toàn chuỗi lỗi; handler dùng `errors.As` để lấy lại `UpstreamError` dù nó đã được bọc. Nếu thay `%w` bằng `%v`, thông tin kiểu lỗi sẽ bị mất.

| Tình huống | HTTP từ Gin | Code |
| --- | --- | --- |
| FastAPI trả 429 | 429 | `INFERENCE_BUSY` |
| Kết nối lỗi, phản hồi lỗi hoặc JSON/kích thước không hợp lệ | 502 | `INFERENCE_UNAVAILABLE` |
| Timeout khi gọi inference | 504 | `INFERENCE_TIMEOUT` |
| Lỗi nội bộ khác | 500 | `ERR_INTERNAL_SERVER` |

Chi tiết kỹ thuật được log ở server; giao diện nhận thông báo dễ hiểu. Payload thành công tiếp tục là `{ Status: "success", Data: ... }`. Ảnh không có vật thể vẫn thành công với `detections: []`.

### Chặng 2: tách phần gọi API dùng chung

`frontend/src/detection.ts` chứa `Result`, `Detection`, `DetectionError` và `detectImage`. Cả ảnh tải lên và webcam dùng cùng hàm này để tránh hai bản xử lý API lệch nhau.

Hàm tạo `FormData`, thêm Blob với field `image`, gọi fetch, đọc JSON và kiểm tra dữ liệu trước khi vẽ. Kích thước phải dương; confidence và tọa độ phải là số hữu hạn; box phải có bốn tọa độ theo thứ tự và nằm trong ảnh. Dữ liệu lỗi sẽ thành thông báo thay vì tọa độ CSS sai.

`DetectionError.retryable` tách hai loại hành vi: lỗi mạng/429/502/504 có thể thử lại; dữ liệu thành công sai cấu trúc hoặc lỗi khác cần dừng và báo người dùng. Không tự thử lại vô hạn.

### Chặng 3: quản lý phiên camera và vòng nhận diện

`frontend/src/useWebcam.ts` sở hữu camera, request và timer. `main.tsx` chỉ chọn nguồn hình ảnh và hiển thị kết quả. Cách tách này giúp đọc riêng cơ chế camera mà không phải đi qua toàn bộ JSX.

Khi nhấn Bật webcam:

1. Dọn phiên cũ, tạo một phiên mới với biến `active` riêng.
2. Xin quyền `getUserMedia({ audio: false, video: ... })`, ưu tiên 640 × 480.
3. Gắn MediaStream vào `video.srcObject`, chờ `video.play()`.
4. Chụp khung đầu tiên, gửi API, xử lý kết quả rồi mới lên lịch lượt tiếp theo.

Camera có thể trả kích thước khác yêu cầu vì `ideal` là mong muốn, không phải ràng buộc bắt buộc. Code lấy `videoWidth` và `videoHeight` thực tế, giữ tỉ lệ, giảm cạnh dài về tối đa 640 pixel và không phóng ảnh nhỏ lên. Canvas xuất JPEG chất lượng 0,8 bằng `toBlob`, tránh chuyển ảnh qua chuỗi base64.

### Vì sao không dùng setInterval gửi ảnh?

Giả sử timer chạy mỗi 333 ms nhưng API mất 900 ms. Nếu mỗi nhịp đều gửi, nhiều request sẽ chồng lên nhau và FastAPI trả 429. Nếu xếp hàng, kết quả ngày càng cũ.

Vòng hiện tại chỉ lên lịch sau khi lượt trước kết thúc. Thời gian chờ là `max(0, 1000/3 - thời_gian_lượt_vừa_xong)`. Khi API nhanh, tốc độ được giới hạn xấp xỉ ba lượt mỗi giây; khi API chậm, tốc độ tự giảm. Các khung trung gian được bỏ qua. Đây là giới hạn tần suất gửi, không phải cam kết GPU đạt ba kết quả mỗi giây.

### Vì sao vừa abort vừa cần biến active?

`AbortController` hủy fetch, nhưng không hủy được hộp thoại xin quyền camera hoặc callback `toBlob` đã bắt đầu. Ví dụ: người dùng nhấn Bật → nhấn Tắt trong lúc hộp thoại quyền còn mở → sau đó cấp quyền. Khi promise trả về, `active` đã là false nên code lập tức stop các track vừa nhận, không gửi ảnh.

Mỗi lần bắt đầu có closure `active` riêng. Kết quả của phiên cũ không thể cập nhật state của phiên mới. Khi dọn phiên, code đánh dấu inactive trước, hủy timer, abort request, stop tất cả track và gỡ `srcObject` của đúng stream đó.

Hủy HTTP không đảm bảo phép tính GPU đã chạy cũng bị hủy. Nếu bật lại rất nhanh, FastAPI có thể vẫn bận với lượt trước; nhánh 429 và thử lại xử lý trường hợp này.

### Tuổi kết quả và độ trễ

Tuổi được tính từ thời điểm chụp, bao gồm encode, truyền HTTP và xử lý server. `processing_ms` của inference chỉ phản ánh phần server nên không dùng thay cho độ trễ toàn luồng.

Kết quả quá 1.500 ms không được vẽ. Với kết quả còn mới, timer sẽ xóa box và số đếm khi nó tới ngưỡng này, kể cả request tiếp theo vẫn đang chờ. Giao diện hiện “Kết quả chậm” để phân biệt với kết quả thành công không phát hiện vật thể.

Video và box nằm trong cùng vùng giữ tỉ lệ, không lật ảnh. Ví dụ ảnh gửi rộng 640, box bắt đầu ở x = 64 thì vị trí trái là 10%. Khi cửa sổ thay đổi, phần trăm này vẫn đúng. Thành phần `DetectionBoxes` dùng chung cho ảnh và webcam.

Mỗi kết quả mới thay toàn bộ danh sách và reset lựa chọn. Chỉ số `#1` là thứ tự trong khung, không phải ID theo dõi lâu dài. Việc đọc vật đang chọn dùng optional chaining để không lỗi nếu khung mới có ít vật thể hơn khung trước.

### Thử lại và các trạng thái giao diện

| Trạng thái | Ý nghĩa |
| --- | --- |
| `idle` | Camera đã tắt, chưa có kết quả |
| `starting` | Đang xin quyền hoặc mở stream |
| `running` | Đang nhận diện, chờ/cập nhật từng kết quả |
| `retrying` | Lỗi tạm thời, chờ trước khi gửi lại |
| `failed` | Dừng gửi; người dùng có thể Thử lại hoặc Tắt webcam |

Sau lỗi có thể phục hồi, chờ 1, 2 rồi 4 giây: một lượt đầu cộng tối đa ba lượt thử lại. Thành công sẽ reset số lỗi. Hết số lần thử, video có thể vẫn xem được nhưng vòng gửi đã dừng. Nhấn Thử lại sẽ dọn phiên cũ và mở phiên mới.

Lỗi quyền bị từ chối, camera không có hoặc không đọc được có thông báo riêng. Track `ended` xử lý camera bị ngắt trong lúc dùng. Đổi sang Tải ảnh, ẩn trang, rời trang hoặc unmount đều dọn tài nguyên. Khi quay lại trang phải chủ động bật lại.

## 4. Đọc và chạy code

Thứ tự đọc gợi ý: `detection.ts` → `useWebcam.ts` → `DetectionBoxes`/`switchMode` trong `main.tsx` → `UpstreamError` trong Go client → handler → các test.

Chạy stack thật theo README gốc khi Docker Desktop đã chạy và model đã cấu hình:

```powershell
docker compose up -d --build --wait --wait-timeout 180
```

Mở `http://localhost:5174`, chọn Webcam → Bật webcam → cho phép camera. Dùng cùng origin `localhost` nhất quán vì quyền của `localhost` và `127.0.0.1` được lưu riêng. Nếu camera đang bị ứng dụng khác chiếm, đóng ứng dụng đó rồi Thử lại.

Chạy mock độc lập theo README; mock vẫn sử dụng camera thật để chụp JPEG nhưng kết quả nhận diện do kịch bản giả lập tạo ra. Nhãn “Dữ liệu mô phỏng” phải được hiểu đúng, không chứng minh model nhận diện được hình đang thấy.

Chạy các kiểm tra tự động:

```powershell
go -C backend test -mod=readonly ./...
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend exec -- playwright install chromium
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:e2e
```

Playwright tự mở Vite tại `127.0.0.1:5199`. Bộ test tạo MediaStream từ canvas và thay API bằng phản hồi kiểm soát được. Camera giả không truy cập webcam vật lý, không chứng minh chất lượng mô hình hoặc khả năng cấp quyền trên mọi máy.

## 5. Kết quả kiểm chứng

Kết quả cuối cùng ngày 17/11/2026:

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| `go -C backend test -mod=readonly ./...` | PASS. Client: multipart, thành công rỗng, model bận, lỗi server, JSON lỗi, payload thiếu, timeout trước header và khi đọc body. Handler: thành công và mã 429/502/504 qua lỗi đã bọc. |
| `npm.cmd --prefix frontend run build` | PASS: TypeScript và Vite build. |
| `npm.cmd --prefix frontend run test:e2e` | 12/12 PASS trên Chromium, lượt cuối 24,2 giây. |
| Kiểm tra ảnh giao diện | Đã mở screenshot từ test và xem bố cục video, box, danh sách, nhóm thùng. Dữ liệu và video trong ảnh là giả lập. |
| `git diff --check` | PASS. Git chỉ cảnh báo quy đổi LF/CRLF theo cấu hình Windows. |
| Stack GPU qua Docker | Đã build và khởi động sau lượt test tự động: cả ba service healthy, model warm-up trên `cuda:0` (RTX 2050); frontend và health API trả HTTP 200. Chưa có bằng chứng nghiệm thu nhận diện từ webcam thật. |
| Webcam vật lý liên tục 5 phút, Chrome/Edge thật | Chưa nghiệm thu; không dùng kết quả camera giả để thay thế. |

12 tình huống trình duyệt bao phủ: JPEG đúng kích thước và gửi tuần tự; box đúng tỉ lệ sau resize; quyền bị từ chối; cấp quyền sau khi đã dừng; 429 rồi phục hồi và khung rỗng; kết quả hết hạn và phản hồi phiên cũ; hết ba lần thử lại; camera bị ngắt; tải ảnh sau webcam; ẩn trang không tự khởi động lại; nhiều vật thể/thùng chưa xác định; payload sai; và request quá 12 giây bị hủy rồi thử lại.

### Nhật ký các vấn đề gặp và cách xử lý

- Lần chạy build đầu tiên đã qua. Cài dependency bị chặn DNS trong sandbox, nên xin quyền tải Playwright và cài Chromium phục vụ kiểm thử; không thay registry hoặc tắt bảo vệ.
- Lệnh Go ban đầu không truy cập được cache Go nằm ngoài workspace. Sau khi được cấp quyền chạy kiểm thử, các test đã qua. Không đổi cấu hình Go toàn máy.
- Server giả ở test timeout ban đầu chờ hủy context mà thiếu cận chờ, làm test treo. Thêm cận 100 ms cho server giả để test luôn kết thúc. Đây là sửa test, không giảm timeout 10 giây của client thật.
- Cấu hình test thống nhất `127.0.0.1` với địa chỉ Vite bind để tránh nhầm giữa IPv4 và `localhost`. Playwright còn thiếu browser binary nên phải cài Chromium trước khi chạy được test.
- Rà soát timeout phát hiện lỗi có thể xảy ra cả lúc chờ header lẫn đọc JSON body. Tách `upstreamFailure` dùng cho cả hai và thêm test body đọc quá hạn; cả hai đều trả 504.
- Lượt kiểm thử cuối: Go PASS, frontend build PASS và 12/12 browser test PASS. Không sửa inference/model hoặc tự ghi kết quả nhận diện thật vào tài liệu.

Các bằng chứng trên chứng minh những hành vi đã kiểm tra trong môi trường local. Chúng chưa chứng minh độ chính xác YOLO trên cảnh webcam thực tế, tốc độ GPU thực tế hoặc độ ổn định nhiều giờ.

## 6. Nghiệm thu webcam thật

Trên Chrome/Edge Windows, chạy stack thật rồi đặt các vật mẫu trước camera. Kiểm tra box, nhãn, thùng và việc số đếm giảm khi lấy vật ra; ghi lại độ trễ, số lần cập nhật/giây và điều kiện ánh sáng. Nếu vật di chuyển, quan sát độ trễ đúng giới hạn của thiết kế video live.

Chạy liên tục ít nhất 5 phút, sau đó bật–tắt nhiều lần, đổi sang tải ảnh, ẩn trang và quay lại. Xác nhận camera được giải phóng khi tắt; khi trở lại không tự gửi ảnh. Dùng DevTools Network kiểm tra không có request tiếp diễn sau khi dừng. Chạy thêm tình huống model bận/mất kết nối và khôi phục dịch vụ.

Đây là bước nghiệm thu thủ công còn cần làm khi có camera thật và GPU đang chạy; không đánh dấu đạt chỉ vì các test tự động thành công.

## 7. Tự kiểm tra kiến thức

1. API mất 900 ms thì vòng gửi có đạt ba lượt/giây không? Giải thích theo thời điểm lên lịch tiếp theo.
2. Bỏ kiểm tra `active` sau `getUserMedia` sẽ gây vấn đề gì khi quyền camera được cấp muộn?
3. Vì sao số lượng không cộng dồn? Nếu muốn đếm vật thể duy nhất cần thêm khái niệm tracking nào?
4. Vì sao độ trễ trên giao diện có thể lớn hơn `processing_ms`?
5. Bỏ `%w` trong service ảnh hưởng gì tới việc phân loại lỗi ở handler?
6. Tìm trong test nơi cố ý làm API chậm. Điều gì sẽ xảy ra nếu thay vòng hiện tại bằng `setInterval`?

Tham khảo API gốc: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [stop track](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop), [toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob), [mock browser APIs trong Playwright](https://playwright.dev/docs/mock-browser-apis).
