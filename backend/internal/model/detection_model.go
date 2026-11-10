package model

type Detection struct {
	ClassID     int
	ClassName   string
	Confidence  float64
	BoundingBox [4]float64
}
type DetectionResult struct {
	ImageWidth   int
	ImageHeight  int
	Device       string
	ProcessingMS float64
	Detections   []Detection
}
