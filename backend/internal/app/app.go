package app

import (
	"github.com/gin-gonic/gin"
	v1handler "github.com/tlong15306/medical-supplies-detection/backend/internal/handler/v1"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/routes"
)

type Application struct {
	router *gin.Engine
}

func NewApplication() *Application {
	router := gin.Default()
	healthHandler := v1handler.NewHealthHandler()
	routes.RegisterRoutes(router, healthHandler)

	return &Application{
		router: router,
	}
}
func (a *Application) Run() error {
	return a.router.Run(":8080")
}
