package routes

import (
	"github.com/gin-gonic/gin"
	v1handler "github.com/tlong15306/medical-supplies-detection/backend/internal/handler/v1"
)

type DetectionRoutes struct {
	handler *v1handler.DetectionHandler
}

func NewDetectionRoutes(detectionHandler *v1handler.DetectionHandler) *DetectionRoutes {
	return &DetectionRoutes{
		handler: detectionHandler,
	}
}
func (dr *DetectionRoutes) Register(r *gin.RouterGroup) {
	detections := r.Group("/detections")
	{
		detections.POST("", dr.handler.Detect)
	}
}
