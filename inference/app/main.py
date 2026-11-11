import logging
import os
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from threading import Lock
from time import perf_counter
from typing import Annotated

import torch
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from ultralytics import YOLO

logger = logging.getLogger("uvicorn.error")
DEVICE = torch.device("cuda:0")
IMAGE_SIZE = 640
DEFAULT_CONFIDENCE = 0.25
IOU_THRESHOLD = 0.45
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[1] / "model_assets" / "best.pt"


class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox_xyxy: tuple[float, float, float, float]


class ImageSize(BaseModel):
    width: int
    height: int


class Prediction(BaseModel):
    frame_id: int | None
    model: str
    device: str
    image: ImageSize
    confidence_threshold: float
    processing_ms: float
    detections: list[Detection]


def predict_image(model: YOLO, image: Image.Image, confidence: float):
    return model.predict(
        source=image,
        device=str(DEVICE),
        imgsz=IMAGE_SIZE,
        rect=False,
        conf=confidence,
        iou=IOU_THRESHOLD,
        save=False,
        verbose=False,
    )[0]


@asynccontextmanager
async def lifespan(app: FastAPI):
    weights = Path(os.environ.get("MODEL_PATH", DEFAULT_MODEL_PATH)).expanduser()
    if not weights.is_file() or weights.suffix.lower() != ".pt":
        raise RuntimeError(f"Set MODEL_PATH to a local Ultralytics .pt file: {weights}")
    if not torch.cuda.is_available():
        raise RuntimeError("cuda:0 is unavailable. Check the NVIDIA driver and PyTorch CUDA build.")

    model = YOLO(str(weights.resolve()))
    if model.task != "detect":
        raise RuntimeError(f"Expected an object detection checkpoint, got task={model.task!r}")
    with Image.new("RGB", (IMAGE_SIZE, IMAGE_SIZE)) as warmup_image:
        predict_image(model, warmup_image, DEFAULT_CONFIDENCE)
    torch.cuda.synchronize(DEVICE)

    actual_device = model.predictor.device
    if actual_device != DEVICE:
        raise RuntimeError(f"Expected {DEVICE}, but the model is running on {actual_device}")

    app.state.model = model
    app.state.device = str(actual_device)
    app.state.predict_lock = Lock()
    logger.info(
        "Model %s warmed up on %s (%s)",
        weights.name,
        actual_device,
        torch.cuda.get_device_name(DEVICE),
    )
    yield


app = FastAPI(title="Medical Supplies Inference", lifespan=lifespan)


@app.get("/health/ready")
def ready(request: Request):
    return {"status": "ready", "device": request.app.state.device}


def decode_image(upload: UploadFile) -> Image.Image:
    raw = upload.file.read(MAX_IMAGE_BYTES + 1)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image exceeds 10 MiB")

    try:
        with Image.open(BytesIO(raw)) as image:
            if image.format not in {"JPEG", "PNG"}:
                raise HTTPException(415, "Only JPEG and PNG images are supported")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(413, "Image exceeds 20 megapixels")
            return ImageOps.exif_transpose(image).convert("RGB")
    except Image.DecompressionBombError as exc:
        raise HTTPException(413, "Image exceeds 20 megapixels") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise HTTPException(422, "Image could not be decoded") from exc


@app.post("/predict", response_model=Prediction)
def predict(
    request: Request,
    image: Annotated[UploadFile, File()],
    confidence_threshold: Annotated[float, Form(ge=0, le=1)] = DEFAULT_CONFIDENCE,
    frame_id: Annotated[int | None, Form(ge=0)] = None,
):
    start = perf_counter()
    state = request.app.state
    if not state.predict_lock.acquire(blocking=False):
        raise HTTPException(429, "Model is busy")

    try:
        with decode_image(image) as decoded:
            result = predict_image(state.model, decoded, confidence_threshold)
            height, width = result.orig_shape

        detections = []
        if result.boxes is not None:
            boxes = result.boxes.cpu()
            for coords, score, class_id in zip(
                boxes.xyxy.tolist(), boxes.conf.tolist(), boxes.cls.int().tolist()
            ):
                detections.append(
                    Detection(
                        class_id=class_id,
                        class_name=result.names[class_id],
                        confidence=score,
                        bbox_xyxy=tuple(coords),
                    )
                )
    finally:
        state.predict_lock.release()

    return Prediction(
        frame_id=frame_id,
        model="YOLO11s",
        device=state.device,
        image=ImageSize(width=width, height=height),
        confidence_threshold=confidence_threshold,
        processing_ms=round((perf_counter() - start) * 1000, 2),
        detections=detections,
    )
