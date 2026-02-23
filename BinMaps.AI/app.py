from contextlib import asynccontextmanager
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import io
import logging
import os
import numpy as np
import torch
import torch.nn as nn
import torchvision.transforms as transforms
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:4200").split(",")
MODEL_PATH      = os.getenv("MODEL_PATH", "model.pt")
DEVICE          = torch.device("cuda" if torch.cuda.is_available() else "cpu")
CLASSES         = ["clean", "moderate", "full", "fire", "damaged"]


class BinClassifier(nn.Module):
    def __init__(self, num_classes: int = 5):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d(4),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.4),
            nn.Linear(128 * 4 * 4, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x))


_model: BinClassifier | None = None

TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def load_model() -> BinClassifier:
    model = BinClassifier(num_classes=len(CLASSES)).to(DEVICE)
    if os.path.exists(MODEL_PATH):
        model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
        logger.info("Model loaded from %s", MODEL_PATH)
    else:
        logger.warning("No model file at %s — using untrained weights.", MODEL_PATH)
    model.eval()
    return model


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    _model = load_model()
    logger.info("AI service ready on device: %s", DEVICE)
    yield
    _model = None


app = FastAPI(title="BinMaps AI Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ALLOWED_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["POST"],
    allow_headers     = ["*"],
)


def predict(image_bytes: bytes) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = TRANSFORM(image).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        logits      = _model(tensor)
        probs       = torch.softmax(logits, dim=1)[0]
        best_idx    = int(probs.argmax())
        confidence  = round(float(probs[best_idx]) * 100, 2)
        best_class  = CLASSES[best_idx]

    return {
        "confidence":     confidence,
        "detected_class": best_class,
        "fire_detected":  best_class == "fire",
        "fill_percentage": _estimate_fill(best_class, confidence),
        "all_scores":     {cls: round(float(probs[i]) * 100, 2) for i, cls in enumerate(CLASSES)},
    }


def _estimate_fill(detected_class: str, confidence: float) -> float:
    base = {"clean": 10.0, "moderate": 50.0, "full": 90.0, "fire": 85.0, "damaged": 60.0}
    return round(base.get(detected_class, 50.0) * (confidence / 100), 1)


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded.")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Файлът трябва да е изображение.")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Файлът е прекалено голям (max 10 MB).")

    try:
        result = predict(contents)
        return result
    except Exception as exc:
        logger.error("Prediction failed: %s", exc)
        raise HTTPException(status_code=500, detail="Грешка при анализ на изображението.")


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _model is not None, "device": str(DEVICE)}