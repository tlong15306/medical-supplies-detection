package service

import (
	"context"
	"fmt"
	"io"

	"github.com/tlong15306/medical-supplies-detection/backend/internal/client/inference"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/model"
)

type detectionService struct {
	client *inference.Client
}

func NewDetectionService(client *inference.Client) *detectionService {
	return &detectionService{client: client}
}
func (s *detectionService) Detect(ctx context.Context, filename string, image io.Reader) (model.DetectionResult, error) {
	prediction, err := s.client.Predict(ctx, filename, image)
	if err != nil {
		return model.DetectionResult{}, fmt.Errorf("detect image: %w", err)
	}
	detections := make([]model.Detection, 0, len(prediction.Detections))

	for _, item := range prediction.Detections {
		detections = append(detections, model.Detection{
			ClassID:     item.ClassID,
			ClassName:   item.ClassName,
			Confidence:  item.Confidence,
			BoundingBox: item.BoundingBox,
		})
	}
	return model.DetectionResult{
		ImageWidth:   prediction.Image.Width,
		ImageHeight:  prediction.Image.Height,
		Device:       prediction.Device,
		ProcessingMS: prediction.ProcessingTime,
		Detections:   detections,
	}, nil

}
