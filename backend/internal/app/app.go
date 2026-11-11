package app

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/config"
	v1handler "github.com/tlong15306/medical-supplies-detection/backend/internal/handler/v1"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/routes"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/validation"
)

type Module interface {
	Routes() routes.Route
}

type Application struct {
	config  *config.Config
	router  *gin.Engine
	modules []Module
}

func NewApplication(cfg *config.Config) *Application {
	if err := validation.InitValidator(); err != nil {
		log.Fatalf("Validator init failed %v", err)
	}

	r := gin.Default()
	healthHandler := v1handler.NewHealthHandler()
	r.GET("/health/live", healthHandler.Live)

	modules := []Module{
		NewDetectionModule(cfg.InferenceBaseURL),
	}

	routes.RegisterRoutes(r, getModulRoutes(modules)...)

	return &Application{
		config:  cfg,
		router:  r,
		modules: modules,
	}
}

func (a *Application) Run() error {
	return a.router.Run(a.config.ServerAddress)
}

func getModulRoutes(modules []Module) []routes.Route {
	routeList := make([]routes.Route, len(modules))
	for i, module := range modules {
		routeList[i] = module.Routes()
	}

	return routeList
}
