package service

import (
	"context"
	"io"

	"github.com/tlong15306/medical-supplies-detection/backend/internal/model"
)

type DetectionService interface {
	Detect(ctx context.Context, filename string, image io.Reader) (model.DetectionResult, error)
}
