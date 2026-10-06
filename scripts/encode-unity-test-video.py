"""Encode a preserved native Unity frame sequence with the E:-resident encoder."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def on_e(path):
    path = Path(path).resolve()
    if path.drive.upper() != "E:":
        raise ValueError(f"Test artifacts must stay on E: {path}")
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("frames")
    parser.add_argument("output")
    parser.add_argument("--encoder", default=r"E:\MetroForgeData\Runtime\video-tools\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe")
    args = parser.parse_args()
    frames, output, encoder = map(on_e, (args.frames, args.output, args.encoder))
    trace = json.loads((frames / "motion.json").read_text(encoding="utf-8-sig"))
    count, fps = len(trace["frames"]), trace["fps"]
    if count == 0 or fps <= 0:
        raise ValueError("Empty recording or invalid cadence")
    expected = [f"frame-{index:05d}.png" for index in range(count)]
    if sorted(path.name for path in frames.glob("frame-*.png")) != expected:
        raise ValueError("Capture frames are missing, duplicated, or outside the trace")
    if any(frame["frame"] != index for index, frame in enumerate(trace["frames"])):
        raise ValueError("Motion trace is not contiguous")
    if output.exists():
        raise FileExistsError(f"Preserve existing evidence: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    encoded = subprocess.run([str(encoder), "-nostdin", "-n", "-framerate", str(fps),
        "-start_number", "0", "-i", str(frames / "frame-%05d.png"), "-frames:v", str(count),
        "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)],
        capture_output=True, text=True)
    output.with_suffix(".encode.log").write_text(encoded.stderr, encoding="utf-8")
    encoded.check_returncode()
    decoded = subprocess.run([str(encoder), "-nostdin", "-v", "error", "-progress", "pipe:1",
        "-i", str(output), "-f", "null", "-"], capture_output=True, text=True)
    output.with_suffix(".decode.log").write_text(decoded.stdout + decoded.stderr, encoding="utf-8")
    decoded.check_returncode()
    decoded_count = int([line.split("=", 1)[1] for line in decoded.stdout.splitlines()
        if line.startswith("frame=")][-1])
    if decoded_count != count or decoded.stderr.strip():
        raise ValueError("Encoded video did not decode every recorded frame cleanly")
    result = {"frames": count, "fps": fps, "durationSeconds": count / fps,
        "decodedFrames": decoded_count, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "source": str(frames), "video": str(output), "scope": trace["scope"]}
    output.with_suffix(".json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
