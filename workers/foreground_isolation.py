"""Local U2-Net isolation, shared algorithm from apple_mps_worker; see u2net_model.py for provenance."""
import os
import time
import base64
from io import BytesIO

U2NET_WEIGHTS_PATH = os.environ.get(
    "METROFORGE_U2NET_WEIGHTS_PATH",
    os.path.join(os.path.dirname(__file__), "..", "models", "apple-native", "u2net", "u2net_full_weights.pth"),
)

_u2net_cache: dict = {}


def _load_u2net(device: str):
    """Lazily loads (and caches, per worker process) the U^2-Net segmentation model -- see
    workers/u2net_model.py's header for architecture/weights provenance and license (both
    Apache-2.0). Used only to produce a real alpha matte for diffusion sources, which arrive fully
    opaque (no transparency at all) -- see docs/audit/MODERN_COHESION_TEST_PROJECT.md's eighth
    session for why the existing fitOpaqueIntoFrame()/pickActorSubjectBounds() character-framing
    logic silently downscales the whole scene instead of isolating the subject without this."""
    if device in _u2net_cache:
        return _u2net_cache[device]
    import torch
    from u2net_model import U2NET

    model = U2NET(3, 1)
    state_dict = torch.load(U2NET_WEIGHTS_PATH, map_location="cpu", weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()
    model.to(device)
    _u2net_cache[device] = model
    return model


def segment_foreground(image_bytes: bytes) -> dict:
    """Runs U^2-Net on a fully-opaque source image and returns an RGBA PNG whose alpha channel is
    a real foreground/background matte -- RGB pixels are untouched (never recolored, never
    cropped: framing/cropping stays the existing, separate fitOpaqueIntoFrame() job in
    pixel-art-processor.ts, which this function's output now gives real alpha data to work with).

    A light floor (values below FLOOR are zeroed) suppresses faint low-confidence background
    noise without hard-binarizing the mask -- the pipeline's own normalize step
    (pixel-art-processor.ts's cleanupAlpha) already binarizes at its own threshold once the real
    subject has been correctly identified from this soft matte."""
    import numpy as np
    import torch
    from PIL import Image

    if not os.path.isfile(U2NET_WEIGHTS_PATH):
        return {"ok": False, "error": f"U2NET_WEIGHTS_NOT_FOUND: {U2NET_WEIGHTS_PATH}"}

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = _load_u2net(device)

    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    orig_w, orig_h = image.size
    resized = image.resize((320, 320), Image.BILINEAR)
    arr = np.asarray(resized).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    tensor = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).to(device)

    t0 = time.time()
    with torch.no_grad():
        d0 = model(tensor)[0]
    inference_s = time.time() - t0

    pred = d0[:, 0, :, :]
    mn, mx = pred.min(), pred.max()
    pred = (pred - mn) / (mx - mn + 1e-8)
    mask = (pred.squeeze().cpu().numpy() * 255).astype("uint8")
    mask_img = Image.fromarray(mask).resize((orig_w, orig_h), Image.BILINEAR)
    mask_arr = np.asarray(mask_img)

    FLOOR = 25
    mask_arr = np.where(mask_arr < FLOOR, 0, mask_arr).astype("uint8")

    rgba = np.dstack([np.asarray(image), mask_arr])
    out = Image.fromarray(rgba)
    buf = BytesIO()
    out.save(buf, format="PNG")
    out_bytes = buf.getvalue()

    occupancy = float((mask_arr > 16).sum()) / float(mask_arr.size)
    return {
        "ok": True,
        "image_base64": base64.b64encode(out_bytes).decode("ascii"),
        "model": "u2net",
        "modelVersion": "carve/u2net-universal",
        "device": device,
        "inferenceSeconds": round(inference_s, 2),
        "occupancy": round(occupancy, 4),
    }
