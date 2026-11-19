package inference

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"strings"
	"time"
)

type AccessCredentials struct {
	ClientID     string
	ClientSecret string
}

type Client struct {
	baseURL    string
	access     AccessCredentials
	httpClient *http.Client
}

// UpstreamError carries an HTTP classification across the service's %w wrapper.
type UpstreamError struct {
	Status int
	Cause  error
}

func (e *UpstreamError) Error() string {
	return fmt.Sprintf("inference status %d: %v", e.Status, e.Cause)
}
func (e *UpstreamError) Unwrap() error { return e.Cause }

func upstreamFailure(err error) *UpstreamError {
	status := http.StatusBadGateway
	var networkError net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &networkError) && networkError.Timeout()) {
		status = http.StatusGatewayTimeout
	}
	return &UpstreamError{Status: status, Cause: err}
}

type Prediction struct {
	FrameID        *int        `json:"frame_id"`
	ModelName      string      `json:"model"`
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

func NewClient(baseURL string, access AccessCredentials) *Client {
	client := &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		access:  access,
		httpClient: &http.Client{
			Timeout: 10 * time.Second, // Thời gian chờ tối đa cho mỗi request
		},
	}
	if access != (AccessCredentials{}) {
		client.httpClient.CheckRedirect = func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	return client
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
	if c.access != (AccessCredentials{}) {
		if c.access.ClientID == "" || c.access.ClientSecret == "" {
			return Prediction{}, upstreamFailure(errors.New("set both Cloudflare Access credentials"))
		}
		if req.URL.Scheme != "https" || !strings.EqualFold(req.URL.Host, "infer.detect.io.vn") || req.URL.User != nil {
			return Prediction{}, upstreamFailure(errors.New("Cloudflare Access credentials require https://infer.detect.io.vn"))
		}
		req.Header.Set("CF-Access-Client-Id", c.access.ClientID)
		req.Header.Set("CF-Access-Client-Secret", c.access.ClientSecret)
	}

	// Gửi request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Prediction{}, upstreamFailure(err)
	}
	// Đóng luồng phản hồi (Cực kỳ quan trọng) do Connection Pooling kết nối mạng đó sẽ bị treo, dẫn đến rò rỉ kết nối (connection leak) và nhanh chóng làm cạn kiệt tài nguyên của ứng dụng
	defer resp.Body.Close()

	// 6. Kiểm tra mã phản hồi HTTP
	if resp.StatusCode != http.StatusOK {
		status := http.StatusBadGateway
		if resp.StatusCode == http.StatusTooManyRequests {
			status = http.StatusTooManyRequests
		}
		return Prediction{}, &UpstreamError{Status: status, Cause: fmt.Errorf("HTTP %d", resp.StatusCode)}
	}
	var prediction Prediction
	if err := json.NewDecoder(resp.Body).Decode(&prediction); err != nil {
		return Prediction{}, upstreamFailure(err)
	}
	if prediction.Image.Width <= 0 || prediction.Image.Height <= 0 || prediction.Detections == nil {
		return Prediction{}, &UpstreamError{Status: http.StatusBadGateway, Cause: errors.New("invalid prediction payload")}
	}
	return prediction, nil
}
