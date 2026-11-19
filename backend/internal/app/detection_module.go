package app

import (
	"github.com/tlong15306/medical-supplies-detection/backend/internal/client/inference"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/config"
	v1handler "github.com/tlong15306/medical-supplies-detection/backend/internal/handler/v1"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/routes"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/service"
)

type DetectionModule struct {
	routes routes.Route
}

func NewDetectionModule(cfg *config.Config) *DetectionModule {
	client := inference.NewClient(cfg.InferenceBaseURL, inference.AccessCredentials{
		ClientID:     cfg.AccessClientID,
		ClientSecret: cfg.AccessClientSecret,
	})
	detectionService := service.NewDetectionService(client)
	detectionHandler := v1handler.NewDetectionHandler(detectionService)
	detectionRoutes := routes.NewDetectionRoutes(detectionHandler)
	return &DetectionModule{routes: detectionRoutes}
}

func (m *DetectionModule) Routes() routes.Route {
	return m.routes
}
