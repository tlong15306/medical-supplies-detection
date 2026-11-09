package app

import (
	v1handler "github.com/tlong15306/medical-supplies-detection/backend/internal/handler/v1"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/routes"
)

type DetectionModule struct {
	routes routes.Route
}

func NewDetectionModule() *DetectionModule {
	detectionHandler := v1handler.NewDetectionHandler()
	detectionRoutes := routes.NewDetectionRoutes(detectionHandler)
	return &DetectionModule{routes: detectionRoutes}
}

func (m *DetectionModule) Routes() routes.Route {
	return m.routes
}
