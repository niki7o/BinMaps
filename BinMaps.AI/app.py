import asyncio
import io
import logging
import os
from contextlib import asynccontextmanager
import numpy as np
import torch
import torch.nn as nn
import torchvision.models as tv_models
import torchvision.transforms as transforms
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:4200"
).split(",")

MODEL_PATH = os.getenv("MODEL_PATH", "/app/bin_fill_model.pth")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CLASSES = ["clean", "moderate", "full", "fire", "damaged"]


def _build_model(num_classes: int = 5) -> nn.Module:
    """
    MobileNetV2 with a custom classification head.
    Using a pretrained ImageNet backbone means the model already understands
    textures, shapes and colours — fine-tuning on our bin photos gives much
    better results than training a small CNN from scratch.
    weights=None at inference time because we load our own bin_fill_model.pth.
    """
    model = tv_models.mobilenet_v2(weights=None)
    in_features = model.classifier[1].in_features   
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model


_model: nn.Module | None = None

TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    ),
])

# Global flag — set to False when weights don't match the current architecture
_weights_loaded: bool = False

def load_model() -> nn.Module:
    global _weights_loaded
    model = _build_model(num_classes=len(CLASSES)).to(DEVICE)

    if not os.path.exists(MODEL_PATH):
        logger.warning(f"--- WARNING: Model file NOT FOUND at {MODEL_PATH}. Using random weights! ---")
        model.eval()
        return model

    logger.info(f"--- Loading model from {MODEL_PATH} ---")
    try:
        state_dict  = torch.load(MODEL_PATH, map_location=DEVICE)
        model_dict  = model.state_dict()
        filtered    = {k: v for k, v in state_dict.items()
                       if k in model_dict and v.shape == model_dict[k].shape}

        if not filtered:
            logger.error(
                "ARCHITECTURE MISMATCH: the saved .pth was trained with a "
                "different model (old regression BinFillCNN).  "
                "Keys in file: %s  —  keys expected: %s  "
                "Running with RANDOM weights — please retrain the model.",
                list(state_dict.keys())[:4],
                list(model_dict.keys())[:4],
            )
        else:
            model_dict.update(filtered)
            model.load_state_dict(model_dict, strict=False)
            _weights_loaded = True
            logger.info(f"--- Loaded {len(filtered)}/{len(model_dict)} weight tensors OK ---")

    except Exception as e:
        logger.error(f"Error loading .pth file: {e}")

    model.eval()
    return model

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    logger.info("AI Service is starting initialization...")
  
    try:
        loop = asyncio.get_running_loop()
        _model = await loop.run_in_executor(None, load_model)
        logger.info(f"AI Service ready on {DEVICE}")
    except Exception as e:
        logger.error(f"CRITICAL: Model initialization failed: {e}")

    yield
    _model = None

app = FastAPI(
    title="BinMaps AI Service",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _estimate_fill(cls: str) -> float:
    """Return a fixed fill estimate for each class.
    We do NOT scale by confidence because a low-confidence prediction should
    still report a meaningful fill value — the confidence score is shown
    separately in the UI.
    """
    return {
        "clean": 10.0, "moderate": 50.0, "full": 90.0,
        "fire": 85.0, "damaged": 60.0
    }.get(cls, 50.0)

def predict(image_bytes: bytes) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = TRANSFORM(image).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        logits = _model(tensor)
        probs = torch.softmax(logits, dim=1)[0]
        best_idx = int(probs.argmax())
        confidence = round(float(probs[best_idx]) * 100, 2)
        best_class = CLASSES[best_idx]

    # A well-trained model should reach > 40 % confidence for a clear bin photo.
    # If weights are incompatible (random init), all classes score ~20 % —
    # in that case we optimistically report container_detected=True so the
    # user is not blocked, and mark the result as untrusted via weights_loaded.
    if _weights_loaded:
        container_detected = confidence >= 35.0
    else:
        container_detected = True   # can't trust random-weight predictions

    return {
        "confidence": confidence,
        "detected_class": best_class,
        "fire_detected": best_class == "fire",
        "fill_percentage": _estimate_fill(best_class),
        "container_detected": container_detected,
        "weights_loaded": _weights_loaded,   # False = model needs retraining
        "all_scores": {
            cls: round(float(probs[i]) * 100, 2)
            for i, cls in enumerate(CLASSES)
        }
    }

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    if _model is None:
        raise HTTPException(status_code=503, detail="Model still loading or failed to load")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="File must be an image")
    
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    
    try:
        return predict(contents)
    except Exception as exc:
        logger.error(f"Prediction error: {exc}")
        raise HTTPException(status_code=500, detail="Prediction failed")

@app.get("/health")
async def health():
    return {
        "status":          "ready" if _model is not None else "loading",
        "model_loaded":    _model is not None,
        "weights_loaded":  _weights_loaded,    # False = architecture mismatch, needs retrain
        "device":          str(DEVICE),
        "model_path":      MODEL_PATH,
        "file_exists":     os.path.exists(MODEL_PATH),
    }