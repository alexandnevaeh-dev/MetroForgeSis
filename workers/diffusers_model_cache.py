"""Explicit model preparation and offline resolution, independent of inference."""
import json
import os
from pathlib import Path


def cache_root():
    root = Path(os.environ.get("HF_HOME", "E:/MetroForgeData/HuggingFace" if os.name == "nt" else str(Path.home() / ".cache/huggingface")))
    if os.name == "nt" and root.resolve().drive.lower() != "e:":
        raise ValueError("MODEL_CACHE_MUST_STAY_ON_E")
    return root


def configure_verified_tls():
    # Respect an explicit CA configuration. Otherwise use the same trusted
    # Windows roots as the native OS, retaining Mozilla's certificate bundle.
    if os.name != "nt" or os.environ.get("REQUESTS_CA_BUNDLE"):
        return
    import ssl
    import certifi
    roots = []
    for data, encoding, trust in ssl.enum_certificates("ROOT"):
        if encoding == "x509_asn" and (trust is True or "1.3.6.1.5.5.7.3.1" in trust):
            roots.append(ssl.DER_cert_to_PEM_cert(data))
    target = cache_root() / "metroforge" / "windows-trusted-roots.pem"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(Path(certifi.where()).read_text(encoding="ascii") + "\n" + "\n".join(roots), encoding="ascii")
    os.environ["REQUESTS_CA_BUNDLE"] = str(target)
    os.environ["SSL_CERT_FILE"] = str(target)


def required_files(index, available, precision):
    if precision not in ("fp16", "fp32"):
        raise ValueError("Choose fp16 or fp32 model preparation")
    safe = set()
    for name in available:
        if not isinstance(name, str) or name.startswith("/") or "\\" in name or ":" in name or ".." in name.split("/"):
            raise ValueError("Invalid model repository path")
        safe.add(name)
    selected = {"model_index.json"}
    selected.update(name for name in safe if name in ("README.md", "LICENSE", "LICENSE.md", "LICENSE.txt"))
    variant_used = False
    components = [name for name, value in index.items()
                  if not name.startswith("_") and isinstance(value, list) and len(value) == 2 and all(value)]
    if not components:
        raise ValueError("Model index has no pipeline components")
    for component in components:
        names = sorted(name for name in safe if name.startswith(component + "/"))
        metadata = [name for name in names if name.endswith((".json", ".txt", ".model")) and ".safetensors.index.json" not in name]
        selected.update(metadata)
        weights = [name for name in names if name.endswith(".safetensors")]
        half = [name for name in weights if ".fp16." in name or ".fp16-" in name]
        normal = [name for name in weights if ".fp16." not in name and ".fp16-" not in name]
        chosen = half if precision == "fp16" and half else normal
        metadata_only = component == "scheduler" or component == "feature_extractor" or component.startswith("tokenizer")
        if not metadata_only and not chosen:
            raise ValueError("Model component has no safetensors weights: " + component)
        if weights and not chosen:
            raise ValueError("Requested model precision is unavailable: " + component)
        selected.update(chosen)
        if chosen == half and half:
            variant_used = True
        # Sharded weights require their matching index, never the other variant.
        for name in names:
            if name.endswith(".safetensors.index.json"):
                is_half = ".fp16." in name
                if is_half == (chosen == half and bool(half)):
                    selected.add(name)
        if not names:
            raise ValueError("Model component is missing: " + component)
    if not selected.issubset(safe):
        raise ValueError("Required model files are missing")
    return sorted(selected), "fp16" if variant_used else None


def descriptor_path(model_id):
    import hashlib
    key = hashlib.sha256(model_id.encode("utf-8")).hexdigest()
    return cache_root() / "metroforge" / "prepared" / (key + ".json")


def read_prepared(model_id):
    if os.path.isdir(model_id):
        root = Path(model_id).resolve()
        if os.name == "nt" and root.drive.lower() != "e:":
            raise ValueError("MODEL_CACHE_MUST_STAY_ON_E")
        if not (root / "model_index.json").is_file():
            raise ValueError("Local model is missing model_index.json")
        available = [str(path.relative_to(root)).replace("\\", "/") for path in root.rglob("*") if path.is_file()]
        precision = "fp16" if any(".fp16." in name or ".fp16-" in name for name in available) else "fp32"
        files, variant = required_files(json.loads((root / "model_index.json").read_text(encoding="utf-8")), available, precision)
        if any((root / name).stat().st_size == 0 for name in files):
            raise ValueError("Local model preparation incomplete")
        return {"model_id": model_id, "model_path": str(root), "local": True, "precision": precision, "variant": variant, "files": files}
    path = descriptor_path(model_id)
    if path.is_file():
        result = json.loads(path.read_text(encoding="utf-8"))
        root = Path(result["model_path"])
        names = result.get("files")
        valid_names = isinstance(names, list) and names and all(isinstance(name, str) and not name.startswith("/") and "\\" not in name and ":" not in name and ".." not in name.split("/") for name in names)
        within_e = os.name != "nt" or root.resolve().drive.lower() == "e:"
        if result.get("model_id") == model_id and valid_names and within_e and all((root / name).is_file() and (root / name).stat().st_size > 0 for name in names):
            return result
    raise ValueError("MODEL_PREPARATION_REQUIRED: Prepare the local model in the asset workshop before generating artwork.")


def prepare_model(model_id, precision="fp16"):
    if os.path.isdir(model_id):
        return read_prepared(model_id)
    if os.path.isabs(model_id):
        raise ValueError("Local model directory does not exist")
    os.environ.setdefault("HF_HOME", str(cache_root()))
    configure_verified_tls()
    from huggingface_hub import HfApi, hf_hub_download, snapshot_download
    info = HfApi().model_info(model_id)
    index_file = hf_hub_download(model_id, "model_index.json", revision=info.sha)
    index = json.loads(Path(index_file).read_text(encoding="utf-8"))
    files, variant = required_files(index, [entry.rfilename for entry in info.siblings], precision)
    root = snapshot_download(model_id, revision=info.sha, allow_patterns=files, max_workers=1)
    missing = [name for name in files if not (Path(root) / name).is_file() or (Path(root) / name).stat().st_size == 0]
    if missing:
        raise ValueError("Model preparation incomplete")
    result = {"model_id": model_id, "model_path": root, "revision": info.sha,
              "precision": precision, "variant": variant, "files": files, "local": False}
    target = descriptor_path(model_id)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, indent=2), encoding="utf-8")
    os.replace(temporary, target)
    return result
