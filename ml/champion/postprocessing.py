"""Hourly intervals fully inside 01:30--04:30 are 02:00 and 03:00 only."""

from typing import Any

import numpy as np


def postprocess(preds: Any, closed_mask: Any = None) -> Any:
    values = np.asarray(preds, dtype=float)
    if not np.isfinite(values).all():
        raise ValueError("Nonfinite predictions")
    values = np.clip(values, 0, None)
    if closed_mask is not None:
        mask = np.asarray(closed_mask, dtype=bool)
        if mask.shape != values.shape:
            raise ValueError("Mask shape mismatch")
        values = np.where(mask, 0, values)
    if (values >= np.iinfo(np.int64).max).any():
        raise ValueError("Passenger count exceeds int64 range")
    return np.rint(values).astype(np.int64)
