# Đóng gói môi trường Docker cho nhóm

## Mục tiêu và quyết định

Ngày thực hiện: 11/11/2026, múi giờ Việt Nam.

Mỗi thành viên nhận source cùng Dockerfile, Compose và các file khóa dependency để dựng lại các service. Máy chạy nhận diện thật cần NVIDIA GPU, driver phù hợp và Linux containers. Cấu hình được chốt cho x86-64 (`linux/amd64`).

Chế độ đầy đủ gồm frontend → Gin → FastAPI → GPU. Chế độ mock dành cho người làm giao diện chạy độc lập bằng file Compose riêng, không yêu cầu GPU hoặc checkpoint.

Nhóm tiếp tục chia sẻ `best.pt` riêng. Trọng số được gắn vào container khi chạy, không đưa vào image hoặc Git.

## Kế hoạch thực hiện

1. Kiểm tra nhánh, dependency và môi trường đã chạy được inference trên Windows.
2. Cố định các image nền và dependency, tạo Dockerfile cho Gin và FastAPI.
3. Bổ sung endpoint health và ghép các service bằng Compose.
4. Chạy build, kiểm tra GPU trong container, gửi ảnh thật qua FastAPI, Gin và proxy frontend.
5. Ghi lại kết quả và hướng dẫn thành viên mới.

## Nhật ký thay đổi và lý do

### Kiểm tra ban đầu

- Làm trong worktree `PTDACNTT-detection-api-gpu`, nhánh `feat/detection-api-gpu`.
- Baseline là commit `851102e`, backend đã trả mã thùng theo bảng demo của nhóm.
- `docs/frontend-bin-handoff/` có sẵn từ yêu cầu bàn giao frontend, giữ nguyên nội dung đó.
- Compose cũ chỉ có Gin, dùng image Go cùng bind mount source và `go run`.
- FastAPI chạy bằng Python Windows, PyTorch 2.5.1 + CUDA 12.1, Ultralytics 8.4.163.
- Máy xác minh có RTX 2050, 4 GiB VRAM, driver 552.27. Ban đầu Docker Engine tắt; đã khởi động Docker Desktop với WSL2 backend trước khi kiểm tra.

### Dockerfile backend

- Tầng build dùng Go 1.26.5, đọc `go.mod`/`go.sum` và tạo binary Linux với `CGO_ENABLED=0`.
- Tầng runtime dùng Alpine, chỉ copy binary và chạy bằng UID không đặc quyền.
- BuildKit cache giữ module và cache biên dịch. Đổi source không buộc tải lại toàn bộ dependency.
- `backend/.dockerignore` loại file cấu hình riêng, binary, log và thư mục build tạm.
- Khôi phục `GET /health/live` trong ứng dụng để Compose có thể xác nhận Gin đã phục vụ HTTP.

### Dockerfile inference

- Dùng image PyTorch 2.5.1 / CUDA 12.1 / cuDNN9 runtime, Python 3.11.10. Bộ này tương ứng phiên bản PyTorch và CUDA đã được kiểm tra trên Windows.
- Image nền đã chứa PyTorch và torchvision; pip cài phần FastAPI/Ultralytics còn lại.
- `requirements.txt` giữ các dependency trực tiếp; `constraints.txt` cố định các phiên bản dependency đã chọn.
- Cài thư viện hệ thống cần cho OpenCV. Chạy `pip check` ngay trong build để phát hiện dependency không tương thích.
- Lượt build đầu phát hiện `ninja 1.11.1.1 is not supported on this platform`. Đã tái hiện bằng `pip check` ngay trên image PyTorch nền; `pip show ninja` xác nhận không có package khác yêu cầu nó. Gỡ `ninja` khỏi runtime trước khi cài dependency vì ứng dụng dùng PyTorch dựng sẵn, không biên dịch extension C++. Giữ nguyên bước `pip check` để tiếp tục kiểm tra môi trường.
- Chạy một worker Uvicorn để giữ một bản model trong VRAM.
- `MODEL_PATH` bên trong container luôn là `/models/best.pt`.
- Cấu hình/cache Ultralytics và Matplotlib ghi vào `/tmp`, phù hợp với user không đặc quyền.
- `GET /health/ready` chỉ truy cập được sau khi lifespan đã nạp model, warm-up và xác nhận `cuda:0`.
- Thư mục trọng số và môi trường Python local bị loại khỏi Docker build context.

### Dockerfile frontend

- Cố định Node 24.19.0, dùng `npm ci` theo `package-lock.json`.
- User `node` có quyền sở hữu thư mục ứng dụng để Vite ghi cache dependency.
- Đây là môi trường demo/phát triển dùng Vite. Phát hành production với web server tĩnh là bước triển khai riêng.
- Giữ nguyên UI do thành viên frontend phụ trách; cấu hình mock và proxy truyền qua biến môi trường.

### Image và nền tảng

Các image nền được ghi cả tag phiên bản và digest để các máy kéo cùng nội dung. Dependency Go và Node dùng file khóa hiện có; Python dùng constraints đã kiểm chứng trong container. Nếu nâng phiên bản, cần cập nhật cấu hình và chạy lại kiểm tra.

Các gói hệ thống cài qua `apt` lấy từ repository Ubuntu tại thời điểm build. Muốn mọi máy chạy đúng cùng một image đã được kiểm thử, bước phát hành tiếp theo là push image lên registry rồi pull theo digest. Cấu hình hiện tại phục vụ nhóm cùng build từ source; không phải bản sao bit-for-bit của toàn bộ máy phát triển.

Docker cố định userspace của ứng dụng. Driver GPU, kernel/WSL2 và tài nguyên phần cứng vẫn do máy host cung cấp, nên tốc độ thực tế có thể khác giữa thành viên.

### Compose và networking

```text
Trình duyệt → localhost:5174 → frontend:5173
                                  ↓ proxy /api
                              api:8080
                                  ↓ HTTP
                            inference:8000 → cuda:0
```

- `frontend` dùng `VITE_USE_MOCK=0` và `API_PROXY_TARGET=http://api:8080`.
- Gin dùng `SERVER_ADDRESS=:8080` và `INFERENCE_BASE_URL=http://inference:8000`.
- Tên service là địa chỉ nội bộ. `localhost` trong container trỏ về chính container đó.
- Chỉ publish frontend và Gin ra loopback của host; FastAPI nằm trong mạng Compose.
- Healthcheck inference thành công sau warm-up → Gin khởi động → healthcheck Gin thành công → frontend khởi động.
- Healthcheck xác nhận service sẵn sàng; mã xử lý request vẫn phải xử lý lỗi khi upstream gặp sự cố trong lúc chạy.
- Tên project ổn định `medical-supplies` tránh phụ thuộc tên thư mục clone/worktree. Có thể đổi `STACK_NAME` nếu chủ động chạy nhiều bản độc lập.
- File `compose.mock.yaml` chạy một project riêng, mặc định ở cổng 5175. Chạy file này độc lập bằng `-f`, không ghép chồng lên Compose GPU.

Trong lượt thử đầu tiên, biến chuẩn `COMPOSE_PROJECT_NAME` đã ghi đè tên project khai báo ở file mock, khiến mock dùng tên của stack thật. Đã thay cấu hình của nhóm bằng biến `STACK_NAME` và xác minh hai tên là `medical-supplies` / `medical-supplies-mock`. Tránh tự đặt `COMPOSE_PROJECT_NAME` khi dùng đồng thời hai cấu hình; nếu cần override chủ động, dùng `-p` với hai tên khác nhau.

### File môi trường và model

`.env.example` chứa cấu hình mẫu; `.env` là bản local của mỗi người và được Git bỏ qua.
Compose đọc `.env` để thay các giá trị trong YAML. Các giá trị trong `environment` mới được truyền vào từng container cho Go/Python/Vite đọc.

Các cấu hình có thể đổi:

| Biến | Mặc định | Vai trò |
|---|---|---|
| `MODEL_FILE` | `./inference/model_assets/best.pt` | File model trên host |
| `API_PORT` | 8080 | Cổng Gin trên host |
| `FRONTEND_PORT` | 5174 | Cổng UI thật trên host |
| `FRONTEND_MOCK_PORT` | 5175 | Cổng UI mock trên host |
| `VITE_MOCK_SCENARIO` | success | Scenario mock hiện có: success, empty, error |

Đường dẫn model tương đối được tính từ thư mục Compose. Trên Windows có thể dùng đường dẫn tuyệt đối với dấu `/`, ví dụ `C:/models/best.pt`.

Bind mount dùng `create_host_path: false` và `read_only: true`. Nếu thiếu checkpoint, Compose báo lỗi thay vì tạo thư mục rỗng. Container không sửa được file trọng số.

Trên máy kiểm tra, đã copy checkpoint từ vị trí local hiện có sang `inference/model_assets/best.pt`, giữ nguyên file nguồn. SHA-256:

```text
E7A3AFB79600635E1D0B53E2E2A065884EDED162F958812A5F2F2B356CB21515
```

Nhóm đối chiếu hash khi chia sẻ checkpoint. Hash này áp dụng cho checkpoint hiện tại; khi nhóm đổi model, cập nhật hash bàn giao.

Cổng 8080 và 5174 trên máy kiểm tra có tiến trình đang dùng. Bản `.env` local của lượt triển khai này dùng `API_PORT=8082`, `FRONTEND_PORT=5176`; file mẫu vẫn giữ 8080/5174. Vì vậy URL Docker trên máy này là http://localhost:5176 và http://localhost:8082. Chế độ mock dùng 5175.

## Hướng dẫn thành viên mới

Sau khi chủ repo commit/push các file Docker lên nhánh `feat/detection-api-gpu`, thành viên đã được cấp quyền repo có thể lấy source bằng:

```powershell
git clone --branch feat/detection-api-gpu https://github.com/tlong15306/medical-supplies-detection.git
cd medical-supplies-detection
Copy-Item .env.example .env
```

Nếu thay đổi đã merge vào `main`, clone nhánh `main` thay vì nhánh tính năng. Repo private yêu cầu tài khoản GitHub được cấp quyền; không cần cài Go, Node hoặc Python trên host để chạy bằng Docker.

Đặt checkpoint tại `inference/model_assets/best.pt` hoặc sửa `MODEL_FILE` trong `.env`, rồi chạy:

```powershell
docker compose config -q
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
```

Lần đầu cần tải image CUDA và build dependency, nên thời gian dài hơn các lần sau. `--wait-timeout` là thời gian chờ service sẵn sàng sau khi build.

Trong Postman, gửi `POST http://127.0.0.1:8080/api/v1/detections`, Body → form-data → `image` kiểu File.

Để kiểm tra qua proxy frontend bằng ảnh bơm tiêm, chạy script tại gốc repo:

```powershell
.\scripts\check-docker.ps1 -ImagePath "C:\path\to\syringe.jpg" -ExpectedClass syringe -ExpectedBin yellow_sharps
```

Script gửi multipart, kiểm tra cấu trúc response, bbox, confidence và cặp nhãn/thùng mong đợi. Bỏ hai tham số Expected khi thử ảnh bất kỳ. Dùng `-BaseUrl http://127.0.0.1:8080` để thử trực tiếp Gin. Script dành cho PowerShell trên Windows có curl.exe.

Trong terminal PowerShell, có thể gọi bằng:

```powershell
curl.exe --fail-with-body -F "image=@C:\path\to\syringe.jpg" http://127.0.0.1:8080/api/v1/detections
```

Hoặc mở http://localhost:5174 và tải ảnh. Giao diện hiện có hiển thị box, nhãn và confidence. Mã `bin` có trong response; giao diện tên thùng được triển khai theo tài liệu bàn giao frontend.

Máy chỉ làm UI:

```powershell
docker compose -f compose.mock.yaml up -d --build --wait
```

Sau khi sửa source hoặc pull:

```powershell
docker compose up -d --build --wait --wait-timeout 180
```

Source nằm trong image, nên `restart` không cập nhật source mới. Build cache giúp tái sử dụng các tầng dependency.

## Kiểm tra và xử lý lỗi

- Docker báo `dockerDesktopLinuxEngine` không tồn tại → mở Docker Desktop, chờ Engine chạy.
- Thiếu model → đặt đúng `MODEL_FILE`; không commit trọng số.
- Không nhận GPU → xác nhận NVIDIA GPU, driver, WSL2 và chạy `docker compose run --rm --no-deps inference python -c "import torch; print(torch.cuda.is_available())"`.
- Service chưa sẵn sàng → xem `docker compose logs --tail 80 inference api frontend`.
- Cổng đã bị dùng → dừng đúng tiến trình cũ hoặc đổi cổng trong `.env`, rồi `docker compose up -d`.
- Sửa env frontend → chạy lại `docker compose up -d` để Compose tạo lại container với env mới.
- Xem response qua frontend → F12 → Network → request detections → Response.
- Dừng stack thật bằng `docker compose down`, stack mock bằng `docker compose -f compose.mock.yaml down`.
- Lần đầu dựng image CUDA cần tải/giải nén vài GB và đủ dung lượng đĩa. Nếu host đang thiếu RAM, đóng bớt ứng dụng nặng trước khi build. Trong lượt kiểm tra này các container có sẵn từng dừng gần cùng thời điểm lúc giải nén; host còn khoảng 600 MiB RAM trống, nhưng Docker ghi `OOMKilled=false` nên chưa xác định nguyên nhân. Đã khởi động lại đúng hai container có sẵn (`postgres-db`, Gin cũ) và mock; không xóa volume hoặc reset Docker.

## Kết quả xác minh

Đã chạy thực tế ngày 11/11/2026 trên Windows, Docker Desktop/WSL2, RTX 2050. Cổng local của lượt kiểm tra: Gin 8082, frontend 5176, mock 5175.

| Kiểm tra | Kết quả |
|---|---|
| `docker compose config -q`, cả stack thật và mock | Thành công |
| Build image Gin / inference / frontend | Cả ba thành công |
| `go -C backend test -mod=readonly ./...` | Thành công; các package hiện chưa có unit test |
| `npm run build` trong container frontend | TypeScript và Vite build thành công |
| `pip check` trong image/runtime inference | `No broken requirements found` |
| CUDA trong container PyTorch | `torch.cuda.is_available() == True`, RTX 2050 |
| Runtime | Python 3.11.10, torch 2.5.1+cu121, torchvision 0.20.1+cu121, Ultralytics 8.4.163 |
| Khởi động bằng `up --build --wait` | Inference → API → frontend đều `healthy` |
| Model mount | `/models/best.pt` chỉ đọc, source là file local đã đối chiếu SHA-256 |
| FastAPI `POST /predict` nội bộ | HTTP 200, `device=cuda:0`, ảnh 640×640, nhãn `syringe` |
| Gin `POST /api/v1/detections` ở 8082 | Script PASS, `Status=success`, `bin=yellow_sharps` |
| Cùng request qua proxy frontend ở 5176 | Script PASS, giữ nguyên nhãn, confidence, bbox và bin |
| Frontend HTTP | Trang gốc trả HTTP 200 |
| Mock độc lập ở 5175 | Healthy; gửi multipart ảnh qua API mock thành công |
| `git diff --check` | Thành công; `.env` và `.pt` vẫn được Git bỏ qua |

Ảnh kiểm tra là file bơm tiêm local 22.367 byte đã dùng trước đó. Confidence nhận được là `0.9508109092712402`; bbox theo pixel là `[132.5602, 23.0695, 460.7305, 574.7521]`. Sau Gin, trường `bbox_xyxy` của FastAPI trở thành `bbox` theo DTO hiện có và được bổ sung `bin: "yellow_sharps"` từ service.

Ba request liên tiếp ghi nhận `processing_ms` lần lượt 829,42 (FastAPI), 216,97 (Gin) và 29,37 (qua proxy). Đây là các mẫu đơn trong lần chạy, không phải benchmark; chỉ số này do FastAPI đo, không phải toàn bộ độ trễ từ trình duyệt. Lúc warm-up đầu tiên có cảnh báo `NMS time limit 2.050s exceeded`; ứng dụng sau đó hoàn tất startup trên `cuda:0`, và ba lượt ảnh thật đều trả đúng kết quả.

Giới hạn xác minh: công cụ điều khiển browser bị tắt trong Work settings, nên chưa kiểm tra thao tác upload và hình vẽ bbox bằng trình duyệt. Đã kiểm tra HTTP và gửi ảnh qua chính proxy Vite. Frontend hiện có chưa hiển thị tên thùng; phần đó tiếp tục theo `docs/frontend-bin-handoff/`. Đây là cấu hình demo/phát triển, chưa phải triển khai production hay chứng minh chạy được trên mọi loại GPU/OS. Bài unit test ánh xạ thùng vẫn được hoãn theo yêu cầu học sau.

Các thay đổi Docker và tài liệu hiện ở local, chưa commit/push trong lượt này. Trước khi thành viên khác clone để dùng, chủ repo cần commit/push hoặc merge các file này. Không đưa `.env`, `.venv` hay `best.pt` vào commit.

## Nguồn kỹ thuật

- [PyTorch — cặp phiên bản 2.5.1/0.20.1 và CUDA 12.1](https://pytorch.org/get-started/previous-versions/)
- [Docker Compose — cấp quyền GPU](https://docs.docker.com/compose/how-tos/gpu-support/)
- [Docker Compose — healthcheck và thứ tự khởi động](https://docs.docker.com/compose/how-tos/startup-order/)
