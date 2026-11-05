package routes

import (
	"github.com/gin-gonic/gin"
	v1handler "github.com/tlong15306/medical-supplies-detection/backend/internal/handler/v1"
)

func RegisterRoutes(router *gin.Engine, healthHandler *v1handler.HealthHandler) {
	router.GET("/health/live", healthHandler.Live)
	router.GET("/health/test-error", healthHandler.TestResponseError)
}
