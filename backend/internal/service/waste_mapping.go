package service

func resolveBin(className string) *string {
	var bin string

	switch className {
	case "syringe", "sharps":
		bin = "yellow_sharps"

	case "iv_set", "gauze", "gloves", "mask":
		bin = "yellow_infectious"

	case "medicine":
		bin = "black_hazardous"

	default:
		return nil
	}

	return &bin
}
