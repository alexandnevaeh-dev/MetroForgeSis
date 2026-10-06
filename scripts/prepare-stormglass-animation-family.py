from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "packages" / "assets" / "authored" / "stormglass-veilblade"
BASE_ACTIONS = ("idle", "walk", "run", "attack", "airborne", "dash", "hurt", "death")
AIRBORNE_CLIPS = {
    "jump_start": (0, 2),
    "jump": (2, 5),
    "fall": (5, 7),
    "land": (7, 8),
}


def alpha_digest(frame: Image.Image) -> str:
    return hashlib.sha256(frame.convert("RGBA").tobytes()).hexdigest()


def inspect_sheet(path: Path, frame_count: int) -> dict:
    image = Image.open(path).convert("RGBA")
    expected_size = (64 * frame_count, 64)
    if image.size != expected_size:
        raise RuntimeError(f"{path.name} is {image.size}, expected {expected_size}")

    frames = []
    digests = set()
    for index in range(frame_count):
        frame = image.crop((index * 64, 0, (index + 1) * 64, 64))
        box = frame.getchannel("A").point(lambda value: 255 if value >= 18 else 0).getbbox()
        if box is None:
            raise RuntimeError(f"{path.name} frame {index} is empty")
        digest = alpha_digest(frame)
        digests.add(digest)
        frames.append({"index": index, "alphaBox": list(box), "digest": digest})

    if frame_count > 1 and len(digests) < max(2, frame_count // 2):
        raise RuntimeError(f"{path.name} contains too many duplicate frames")
    return {
        "file": path.name,
        "frameSize": [64, 64],
        "frameCount": frame_count,
        "uniqueFrameCount": len(digests),
        "frames": frames,
    }


def main() -> None:
    airborne_path = ASSET_ROOT / "veilblade-airborne-v2.png"
    airborne = Image.open(airborne_path).convert("RGBA")
    if airborne.size != (512, 64):
        raise RuntimeError(f"{airborne_path.name} must be an 8-frame 512x64 sheet")

    for name, (start, end) in AIRBORNE_CLIPS.items():
        clip = airborne.crop((start * 64, 0, end * 64, 64))
        clip.save(ASSET_ROOT / f"veilblade-{name.replace('_', '-')}-v2.png")

    manifest = {
        "family": "stormglass-veilblade-v2",
        "status": "candidate",
        "productionApproved": False,
        "frameSize": [64, 64],
        "anchor": "bottom-center",
        "baseSheets": {},
        "runtimeClips": {},
    }
    for action in BASE_ACTIONS:
        manifest["baseSheets"][action] = inspect_sheet(
            ASSET_ROOT / f"veilblade-{action}-v2.png", 8
        )
    for action, (start, end) in AIRBORNE_CLIPS.items():
        runtime_name = action.replace("_", "-")
        manifest["runtimeClips"][action] = inspect_sheet(
            ASSET_ROOT / f"veilblade-{runtime_name}-v2.png", end - start
        )

    manifest_path = ASSET_ROOT / "animation-family-v2.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({
        "manifest": str(manifest_path),
        "baseSheets": len(manifest["baseSheets"]),
        "runtimeClips": len(manifest["runtimeClips"]),
    }))


if __name__ == "__main__":
    main()
