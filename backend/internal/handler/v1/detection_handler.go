package v1handler

import (
	"log"
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
	file, err := image.Open()
	if err != nil {
		utils.ResponseError(ctx, utils.NewError("Failed to open image file", utils.ErrInternalServer))
		return
	}
	defer file.Close()
	prediction, err := h.inferenceClient.Predict(
		ctx.Request.Context(),
		image.Filename,
		file,
	)
	if err != nil {
		log.Printf("predict image: %v", err)
		utils.ResponseError(ctx, utils.NewError("Failed to get prediction from inference service", utils.ErrInternalServer))
		return
	}
	detections := make([]gin.H, 0, len(prediction.Detections))

	for _, detection := range prediction.Detections {
		detections = append(detections, gin.H{
			"class_id":   detection.ClassID,
			"class_name": detection.ClassName,
			"confidence": detection.Confidence,
			"bbox":       detection.BoundingBox,
		})
	}

	utils.ResponseSuccess(ctx, gin.H{
		"image_width":   prediction.Image.Width,
		"image_height":  prediction.Image.Height,
		"device":        prediction.Device,
		"processing_ms": prediction.ProcessingTime,
		"detections":    detections,
	}, http.StatusOK)

}
