import asyncio
import io
import logging
import os
from contextlib import asynccontextmanager

import torch
import torch.nn as nn
import torchvision.models as tv_models
import torchvision.transforms as transforms
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:4200"
).split(",")

MODEL_PATH = os.getenv("MODEL_PATH", "/app/bin_fill_model.pth")

# When true, /analyze returns 503 if the saved weights could not be loaded
# (architecture mismatch, missing file, partial match). When false (dev only),
# it serves predictions anyway and marks them as untrusted. In production
# this MUST be "true" — predictions from an untrained head are meaningless.
STRICT_WEIGHTS = os.getenv("AI_STRICT_WEIGHTS", "true").lower() in {"1", "true", "yes"}

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CLASSES = ["clean", "moderate", "full", "fire", "damaged"]

# Must match train.py exactly so state_dict keys align.
# train.py replaces the whole classifier with Sequential(Dropout, Linear).
def _build_model(num_classes: int = 5) -> nn.Module:
    model = tv_models.mobilenet_v2(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.4),
        nn.Linear(in_features, num_classes),
    )
    return model


TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    ),
])

# ---------------------------------------------------------------------------
# Model loading state
# ---------------------------------------------------------------------------

_model: nn.Module | None = None
_weights_loaded: bool = False
_weights_error: str | None = None
_weights_matched: int = 0
_weights_total: int = 0


def load_model() -> nn.Module:
    """Build the MobileNetV2 model and attempt to load saved weights.

    On architecture mismatch, `_weights_loaded` stays False, `_weights_error`
    captures the reason, and `/analyze` will refuse to serve predictions
    when STRICT_WEIGHTS is enabled.
    """
    global _weights_loaded, _weights_error, _weights_matched, _weights_total

    model = _build_model(num_classes=len(CLASSES)).to(DEVICE)
    model_dict = model.state_dict()
    _weights_total = len(model_dict)

    if not os.path.exists(MODEL_PATH):
        _weights_error = f"model file not found at {MODEL_PATH}"
        logger.error("AI model file missing: %s", MODEL_PATH)
        model.eval()
        return model

    logger.info("Loading model weights from %s", MODEL_PATH)
    try:
        state_dict = torch.load(MODEL_PATH, map_location=DEVICE)
    except Exception as e:
        _weights_error = f"could not read .pth: {e}"
        logger.error("Failed to torch.load('%s'): %s", MODEL_PATH, e)
        model.eval()
        return model

    # Match keys by name AND shape. Anything that doesn't match is skipped.
    filtered = {
        k: v for k, v in state_dict.items()
        if k in model_dict and v.shape == model_dict[k].shape
    }
    _weights_matched = len(filtered)

    # Accept only near-complete matches. A handful of stray keys is fine
    # (e.g. buffer renames), but <90% match means the .pth is from a
    # different architecture — serving random weights would be dishonest.
    match_ratio = _weights_matched / max(_weights_total, 1)

    if match_ratio < 0.9:
        _weights_error = (
            f"architecture mismatch — only {_weights_matched}/{_weights_total} "
            f"tensors matched ({match_ratio:.0%}). "
            "The saved .pth was likely trained with a different model. "
            "Retrain with `python train.py` to produce a compatible file."
        )
        logger.error("%s", _weights_error)
        logger.error(
            "  keys in file (first 4): %s",
            list(state_dict.keys())[:4],
        )
        logger.error(
            "  keys expected (first 4): %s",
            list(model_dict.keys())[:4],
        )
        model.eval()
        return model

    model_dict.update(filtered)
    model.load_state_dict(model_dict, strict=False)
    _weights_loaded = True
    logger.info(
        "Weights loaded successfully: %d/%d tensors (%.0f%%)",
        _weights_matched, _weights_total, match_ratio * 100,
    )
    model.eval()
    return model


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    logger.info("AI Service starting — device=%s strict=%s", DEVICE, STRICT_WEIGHTS)
    try:
        loop = asyncio.get_running_loop()
        _model = await loop.run_in_executor(None, load_model)
        if _weights_loaded:
            logger.info("AI Service READY")
        else:
            logger.warning(
                "AI Service started but weights NOT loaded (%s). "
                "/analyze will refuse requests while STRICT_WEIGHTS is true.",
                _weights_error,
            )
    except Exception as e:
        logger.error("CRITICAL: Model initialization failed: %s", e)
    yield
    _model = None


app = FastAPI(
    title="BinMaps AI Service",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

# Class -> representative fill %. This is a lookup, not a regression output.
# We expose it as `fill_estimate` (not `fill_percentage`) to make clear
# that it is derived from the class, not measured.
_CLASS_FILL = {
    "clean": 10.0,
    "moderate": 50.0,
    "full": 90.0,
    "fire": 85.0,
    "damaged": 60.0,
}


def predict(image_bytes: bytes) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    tensor = TRANSFORM(image).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        logits = _model(tensor)
        probs = torch.softmax(logits, dim=1)[0]
        best_idx = int(probs.argmax())
        confidence = round(float(probs[best_idx]) * 100, 2)
        best_class = CLASSES[best_idx]

    container_detected = confidence >= 35.0 if _weights_loaded else False

    return {
        "detected_class": best_class,
        "confidence": confidence,
        "fire_detected": best_class == "fire",
        "fill_estimate": _CLASS_FILL.get(best_class, 50.0),
        # Back-compat alias — some callers still read `fill_percentage`.
        "fill_percentage": _CLASS_FILL.get(best_class, 50.0),
        "container_detected": container_detected,
        "weights_loaded": _weights_loaded,
        "all_scores": {
            cls: round(float(probs[i]) * 100, 2)
            for i, cls in enumerate(CLASSES)
        },
    }


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="Model still loading or failed to load",
        )

    if STRICT_WEIGHTS and not _weights_loaded:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI model weights are not loaded — refusing to serve "
                f"untrained predictions. Reason: {_weights_error}. "
                "Retrain the model or set AI_STRICT_WEIGHTS=false for dev."
            ),
        )

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="File must be an image")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")

    try:
        return predict(contents)
    except Exception as exc:
        logger.error("Prediction error: %s", exc)
        raise HTTPException(status_code=500, detail="Prediction failed")


@app.get("/health")
async def health():
    return {
        "status": "ready" if (_model is not None and _weights_loaded) else
                  "degraded" if _model is not None else "loading",
        "model_loaded": _model is not None,
        "weights_loaded": _weights_loaded,
        "weights_matched": _weights_matched,
        "weights_total": _weights_total,
        "weights_error": _weights_error,
        "strict_mode": STRICT_WEIGHTS,
        "device": str(DEVICE),
        "model_path": MODEL_PATH,
        "file_exists": os.path.exists(MODEL_PATH),
        "classes": CLASSES,
    }
