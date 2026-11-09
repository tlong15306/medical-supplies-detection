package interference

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}
type Prediction struct {
	FrameID        *int        `json:"frame_id"`
	ModelName      string      `json:"model_name"`
	Device         string      `json:"device"`
	Image          ImageSize   `json:"image"`
	Confidence     float64     `json:"confidence_threshold"`
	ProcessingTime float64     `json:"processing_ms"`
	Detections     []Detection `json:"detections"`
}
type ImageSize struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}
type Detection struct {
	ClassID     int        `json:"class_id"`
	ClassName   string     `json:"class_name"`
	Confidence  float64    `json:"confidence"`
	BoundingBox [4]float64 `json:"bbox_xyxy"`
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second, // Thời gian chờ tối đa cho mỗi request
		},
	}
}
func (c *Client) Predict(ctx context.Context, filename string, image io.Reader) (Prediction, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	path, err := writer.CreateFormFile("image", filename)
	if err != nil {
		return Prediction{}, fmt.Errorf("Failed to create form file: %w", err)
	}
	if _, err := io.Copy(path, image); err != nil {
		return Prediction{}, fmt.Errorf("Failed to copy image: %w", err)
	}
	if err := writer.Close(); err != nil {
		return Prediction{}, fmt.Errorf("Failed to close writer: %w", err)
	}
	// Tạo HTTP request kèm Context
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/predict", body)
	if err != nil {
		return Prediction{}, fmt.Errorf("Failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Gửi request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Prediction{}, fmt.Errorf("Failed to send request: %w", err)
	}
	// Đóng luồng phản hồi (Cực kỳ quan trọng) do Connection Pooling kết nối mạng đó sẽ bị treo, dẫn đến rò rỉ kết nối (connection leak) và nhanh chóng làm cạn kiệt tài nguyên của ứng dụng
	defer resp.Body.Close()

	// 6. Kiểm tra mã phản hồi HTTP
	if resp.StatusCode != http.StatusOK {
		return Prediction{}, fmt.Errorf("FastAPI returned error status: %d", resp.StatusCode)
	}
	var prediction Prediction
	if err := json.NewDecoder(resp.Body).Decode(&prediction); err != nil {
		return Prediction{}, fmt.Errorf("Failed to decode response: %w", err)
	}
	return prediction, nil
}
