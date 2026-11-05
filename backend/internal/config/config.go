package config

import (
	"os"
)

type Config struct {
	ServerAddress string
}

func NewConfig() *Config {
	address := os.Getenv("SERVER_ADDRESS")
	if address == "" {
		address = ":8080"
	}
	return &Config{
		ServerAddress: address,
	}
}
