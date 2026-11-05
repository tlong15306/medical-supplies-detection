package app

import (
	"github.com/gin-gonic/gin"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/config"
	v1handler "github.com/tlong15306/medical-supplies-detection/backend/internal/handler/v1"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/routes"
)

type Application struct {
	config *config.Config
	router *gin.Engine
}

func NewApplication(cfg *config.Config) *Application {

	router := gin.Default()
	healthHandler := v1handler.NewHealthHandler()
	routes.RegisterRoutes(router, healthHandler)

	return &Application{
		router: router,
		config: cfg,
	}
}
func (a *Application) Run() error {
	return a.router.Run(a.config.ServerAddress)
}
