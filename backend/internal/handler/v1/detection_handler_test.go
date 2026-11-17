package v1handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/client/inference"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/model"
)

type fakeDetectionService struct{ status int }

func (s fakeDetectionService) Detect(context.Context, string, io.Reader) (model.DetectionResult, error) {
	if s.status != 200 {
		return model.DetectionResult{}, fmt.Errorf("detect image: %w", &inference.UpstreamError{Status: s.status, Cause: fmt.Errorf("test failure")})
	}
	return model.DetectionResult{ImageWidth: 640, ImageHeight: 480, Detections: []model.Detection{}}, nil
}

func TestDetectResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		status int
		code   string
	}{{200, ""}, {429, "INFERENCE_BUSY"}, {502, "INFERENCE_UNAVAILABLE"}, {504, "INFERENCE_TIMEOUT"}} {
		t.Run(fmt.Sprint(tc.status), func(t *testing.T) {
			router := gin.New()
			router.POST("/api/v1/detections", NewDetectionHandler(fakeDetectionService{tc.status}).Detect)
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			part, err := writer.CreateFormFile("image", "webcam.jpg")
			if err != nil {
				t.Fatal(err)
			}
			_, _ = part.Write([]byte("image"))
			_ = writer.Close()
			req := httptest.NewRequest(http.MethodPost, "/api/v1/detections", &body)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != tc.status {
				t.Fatalf("HTTP %d: %s", response.Code, response.Body.String())
			}
			var payload map[string]any
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatal(err)
			}
			if tc.status == 200 {
				if payload["Status"] != "success" {
					t.Fatal(payload)
				}
				data := payload["Data"].(map[string]any)
				if len(data["detections"].([]any)) != 0 {
					t.Fatal(data)
				}
			} else if payload["Code"] != tc.code || payload["Error"] == "" {
				t.Fatal(payload)
			}
		})
	}
}
