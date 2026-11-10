package app

import (
	"github.com/tlong15306/medical-supplies-detection/backend/internal/client/inference"
	v1handler "github.com/tlong15306/medical-supplies-detection/backend/internal/handler/v1"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/routes"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/service"
)

type DetectionModule struct {
	routes routes.Route
}

func NewDetectionModule(baseURL string) *DetectionModule {
	client := inference.NewClient(baseURL)
	detectionService := service.NewDetectionService(client)
	detectionHandler := v1handler.NewDetectionHandler(detectionService)
	detectionRoutes := routes.NewDetectionRoutes(detectionHandler)
	return &DetectionModule{routes: detectionRoutes}
}

func (m *DetectionModule) Routes() routes.Route {
	return m.routes
}
