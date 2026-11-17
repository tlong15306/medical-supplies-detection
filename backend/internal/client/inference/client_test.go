package inference

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPredict(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
		want   int
	}{
		{"empty success", 200, `{"image":{"width":640,"height":480},"detections":[]}`, 0},
		{"busy", 429, `{"detail":"busy"}`, 429},
		{"server failure", 500, `{}`, 502},
		{"invalid JSON", 200, `not json`, 502},
		{"invalid shape", 200, `{}`, 502},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/predict" {
					t.Errorf("path = %s", r.URL.Path)
				}
				file, header, err := r.FormFile("image")
				if err != nil {
					t.Error(err)
					return
				}
				defer file.Close()
				if header.Filename != "webcam.jpg" {
					t.Errorf("filename = %s", header.Filename)
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			result, err := NewClient(server.URL).Predict(context.Background(), "webcam.jpg", strings.NewReader("fake image"))
			if tc.want == 0 {
				if err != nil {
					t.Fatal(err)
				}
				if result.Image.Width != 640 || len(result.Detections) != 0 {
					t.Fatalf("unexpected result: %+v", result)
				}
				return
			}
			var upstream *UpstreamError
			if !errors.As(err, &upstream) || upstream.Status != tc.want {
				t.Fatalf("error = %v; want status %d", err, tc.want)
			}
		})
	}
}

func TestPredictTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(100 * time.Millisecond):
		}
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	_, err := NewClient(server.URL).Predict(ctx, "webcam.jpg", strings.NewReader("image"))
	var upstream *UpstreamError
	if !errors.As(err, &upstream) || upstream.Status != 504 || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v", err)
	}
}

func TestPredictTimeoutReadingBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		select {
		case <-r.Context().Done():
		case <-time.After(100 * time.Millisecond):
		}
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	_, err := NewClient(server.URL).Predict(ctx, "webcam.jpg", strings.NewReader("image"))
	var upstream *UpstreamError
	if !errors.As(err, &upstream) || upstream.Status != 504 {
		t.Fatalf("error = %v", err)
	}
}
