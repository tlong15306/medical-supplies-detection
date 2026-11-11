package v1handler

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/dto"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/service"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/utils"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/validation"
)

type DetectionHandler struct {
	service service.DetectionService
}
type DetectionRequest struct {
}

func NewDetectionHandler(service service.DetectionService) *DetectionHandler {
	return &DetectionHandler{
		service: service,
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
	file, err := image.Open()
	if err != nil {
		utils.ResponseError(ctx, utils.NewError("Failed to open image file", utils.ErrInternalServer))
		return
	}
	defer file.Close()
	model, err := h.service.Detect(
		ctx.Request.Context(),
		image.Filename,
		file,
	)
	if err != nil {
		log.Printf("predict image: %v", err)
		utils.ResponseError(ctx, utils.NewError("Failed to get prediction from inference service", utils.ErrInternalServer))
		return
	}
	response := dto.MapDetectionResultToDTO(model)
	utils.ResponseSuccess(ctx, response, http.StatusOK)

}
