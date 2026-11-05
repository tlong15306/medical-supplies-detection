package main

import (
	"log"

	"github.com/tlong15306/medical-supplies-detection/backend/internal/app"
	"github.com/tlong15306/medical-supplies-detection/backend/internal/config"
)

func main() {
	cfg := config.NewConfig()
	application := app.NewApplication(cfg)

	if err := application.Run(); err != nil {
		log.Fatal(err)
	}
}
