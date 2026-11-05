package main

import (
	"log"

	"github.com/tlong15306/medical-supplies-detection/backend/internal/app"
)

func main() {
	application := app.NewApplication()

	if err := application.Run(); err != nil {
		log.Fatal(err)
	}
}
