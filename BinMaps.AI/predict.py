"""
DEPRECATED — do not use.

This CLI predictor used the old BinFillCNN architecture (model.py) which is
incompatible with the current MobileNetV2 weights.  Even worse, it deliberately
enabled `model.train()` during inference to simulate "confidence" via dropout
variance — that approach conflates epistemic uncertainty with random noise and
produces misleading numbers.

For inference use the FastAPI service:

    POST http://localhost:8000/analyze
    Content-Type: multipart/form-data
    Body: file=<image>

Response includes: label, confidence, fill_estimate, all_confidences, and
weights_loaded (false => prediction is not trusted).
"""
import sys

print(
    "predict.py is deprecated. Use the /analyze endpoint of the FastAPI "
    "service (app.py) instead.",
    file=sys.stderr,
)
sys.exit(2)
