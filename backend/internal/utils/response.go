package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type ErrorCodes string

const (
	ErrInternalServer       ErrorCodes = "ERR_INTERNAL_SERVER"
	ErrBadRequest           ErrorCodes = "ERR_BAD_REQUEST"
	ErrNotFound             ErrorCodes = "ERR_NOT_FOUND"
	ErrUnauthorized         ErrorCodes = "ERR_UNAUTHORIZED"
	ErrForbidden            ErrorCodes = "ERR_FORBIDDEN"
	ErrCodeConflict         ErrorCodes = "ERR_CODE_CONFLICT"
	ErrCodeInternal         ErrorCodes = "ERR_CODE_INTERNAL"
	ErrInferenceBusy        ErrorCodes = "INFERENCE_BUSY"
	ErrInferenceUnavailable ErrorCodes = "INFERENCE_UNAVAILABLE"
	ErrInferenceTimeout     ErrorCodes = "INFERENCE_TIMEOUT"
)

type AppError struct {
	Message string
	Code    ErrorCodes
	Err     error
}

func (e *AppError) Error() string {
	return ""
}
func NewError(message string, code ErrorCodes) error {
	return &AppError{
		Message: message,
		Code:    code,
	}
}
func WrapError(err error, message string, code ErrorCodes) error {
	return &AppError{
		Message: message,
		Code:    code,
		Err:     err,
	}
}
func ResponseError(c *gin.Context, err error) {
	if appError, ok := err.(*AppError); ok {
		statusCode := httpStausFromCode(appError.Code)
		response := gin.H{
			"Error": appError.Message,
			"Code":  appError.Code,
		}
		if appError.Err != nil {
			response["Detail"] = appError.Err.Error()
		}
		c.JSON(statusCode, response)
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{
		"Error": err.Error(),
		"Code":  ErrInternalServer,
	})

}
func ResponseSuccess(c *gin.Context, data any, statusCode int) {
	c.JSON(statusCode, gin.H{
		"Status": "success",
		"Data":   data,
	})
}
func ResponseStatus(c *gin.Context, statusCode int) {
	c.Status(statusCode)
}
func ResponseErrorValidator(c *gin.Context, data any) {
	c.JSON(http.StatusBadRequest, data)
}
func httpStausFromCode(code ErrorCodes) int {
	switch code {
	case ErrInferenceBusy:
		return http.StatusTooManyRequests
	case ErrInferenceUnavailable:
		return http.StatusBadGateway
	case ErrInferenceTimeout:
		return http.StatusGatewayTimeout
	case ErrBadRequest:
		return http.StatusBadRequest
	case ErrUnauthorized:
		return http.StatusUnauthorized
	case ErrForbidden:
		return http.StatusForbidden
	case ErrNotFound:
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}
