package config

import (
	"os"
)

type Config struct {
	ServerAddress    string
	InferenceBaseURL string
}

func NewConfig() *Config {
	address := os.Getenv("SERVER_ADDRESS")
	if address == "" {
		address = ":8080"
	}
	inferenceBaseURL := os.Getenv("INFERENCE_BASE_URL")
	if inferenceBaseURL == "" {
		inferenceBaseURL = "http://127.0.0.1:8000"
	}
	return &Config{
		ServerAddress:    address,
		InferenceBaseURL: inferenceBaseURL,
	}
}
