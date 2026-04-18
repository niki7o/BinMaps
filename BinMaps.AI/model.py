"""
DEPRECATED — do not use.

`BinFillCNN` was a from-scratch CNN architecture used in early prototyping.
It was superseded by MobileNetV2 transfer learning (see `train.py` and `app.py`).

The saved weights in `bin_fill_model.pth` are MobileNetV2 weights and are
incompatible with this architecture. Importing this module for inference will
produce random predictions because the state_dict keys do not match.

If you see an ImportError from this module, it is intentional — update the
calling code to use `app._build_model()` or the `/analyze` HTTP endpoint.
"""

raise ImportError(
    "BinMaps.AI.model is deprecated. The BinFillCNN architecture was replaced "
    "by MobileNetV2 transfer learning. Use app.py / train.py instead."
)
