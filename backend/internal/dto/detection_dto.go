package dto

import "github.com/tlong15306/medical-supplies-detection/backend/internal/model"

type DetectionResponse struct {
	ImageWidth   int             `json:"image_width"`
	ImageHeight  int             `json:"image_height"`
	Device       string          `json:"device"`
	ProcessingMS float64         `json:"processing_ms"`
	Detections   []DetectionItem `json:"detections"`
}

type DetectionItem struct {
	ClassID    int        `json:"class_id"`
	ClassName  string     `json:"class_name"`
	Confidence float64    `json:"confidence"`
	BBox       [4]float64 `json:"bbox"`
}

func MapDetectionResultToDTO(result model.DetectionResult) DetectionResponse {
	detections := make([]DetectionItem, 0, len(result.Detections))

	for _, detection := range result.Detections {
		detections = append(detections, DetectionItem{
			ClassID:    detection.ClassID,
			ClassName:  detection.ClassName,
			Confidence: detection.Confidence,
			BBox:       detection.BoundingBox,
		})
	}

	return DetectionResponse{
		ImageWidth:   result.ImageWidth,
		ImageHeight:  result.ImageHeight,
		Device:       result.Device,
		ProcessingMS: result.ProcessingMS,
		Detections:   detections,
	}
}
