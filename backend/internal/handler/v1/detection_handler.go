package v1handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/client/inference"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/utils"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/validation"
)

type DetectionHandler struct {
	inferenceClient *inference.Client
}
type DetectionRequest struct {
}

func NewDetectionHandler(client *inference.Client) *DetectionHandler {
	return &DetectionHandler{
		inferenceClient: client,
	}
}
func (h *DetectionHandler) Detect(ctx *gin.Context) {
	var params DetectionRequest
	if err := ctx.ShouldBind(&params); err != nil {
		utils.ResponseErrorValidator(ctx, validation.HandleValidationErrors(err))
		return
	}

	image, err := ctx.FormFile("image")
	if err != nil {
		utils.ResponseError(ctx, utils.NewError("Failed to get image file", utils.ErrBadRequest))
		return
	}
	utils.ResponseSuccess(ctx, gin.H{
		"filename":   image.Filename,
		"size_bytes": image.Size,
	}, http.StatusOK)

}
