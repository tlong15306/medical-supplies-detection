package v1handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/utils"
)

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}
func (h *HealthHandler) Live(ctx *gin.Context) {
	utils.ResponseSuccess(ctx, gin.H{"status": "ok"}, http.StatusOK)
}
func (h *HealthHandler) TestResponseError(ctx *gin.Context) {
	utils.ResponseError(ctx, utils.NewError("This is a test error", utils.ErrBadRequest))
}
