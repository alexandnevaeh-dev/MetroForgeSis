"""An app-owned, offline, loopback-only ACE-Step API with E-resident caches."""
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse


def main():
    path = Path(os.environ['METROFORGE_LOCAL_AUDIO_CONFIG'])
    if not path.is_absolute() or path.stat().st_size > 16384:
        raise ValueError('Invalid runtime configuration')
    settings = json.loads(path.read_text(encoding='utf-8-sig'))
    endpoint = urlparse(settings['aceBaseUrl'])
    if endpoint.scheme != 'http' or endpoint.hostname not in ('127.0.0.1', 'localhost', '::1') or endpoint.username or endpoint.password or endpoint.path not in ('', '/') or endpoint.query or endpoint.fragment or not endpoint.port or endpoint.port < 1024:
        raise ValueError('Invalid loopback endpoint')
    weights = Path(settings['aceWeightsPath'])
    cache = Path(settings['runtimeCacheRoot'])
    if not weights.is_absolute() or not cache.is_absolute() or weights.drive.lower() != 'e:' or cache.drive.lower() != 'e:':
        raise ValueError('Audio weights and caches must stay on E:')
    for component in ('acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B'):
        if not list((weights / component).glob('*.safetensors')):
            raise ValueError('Missing local audio weights')
    logs = cache / 'logs'
    logs.mkdir(parents=True, exist_ok=True)
    output = (logs / ('ace-' + str(os.getpid()) + '.log')).open('w', encoding='utf-8', buffering=1)
    sys.stdout = output
    sys.stderr = output
    for key, suffix in {'TEMP': 'temp', 'TMP': 'temp', 'ACESTEP_TMPDIR': 'temp', 'HF_HOME': 'huggingface', 'HF_HUB_CACHE': 'huggingface/hub', 'TORCH_HOME': 'torch', 'MPLCONFIGDIR': 'matplotlib', 'CUDA_CACHE_PATH': 'cuda', 'TRITON_CACHE_DIR': 'triton', 'TORCHINDUCTOR_CACHE_DIR': 'torchinductor'}.items():
        target = cache / suffix
        target.mkdir(parents=True, exist_ok=True)
        os.environ[key] = str(target)
    os.environ.update(ACESTEP_CHECKPOINTS_DIR=str(weights), ACESTEP_CONFIG_PATH='acestep-v15-turbo', ACESTEP_INIT_LLM='false', ACESTEP_DEVICE='cuda', ACESTEP_OFFLOAD_TO_CPU='true', ACESTEP_OFFLOAD_DIT_TO_CPU='true', ACESTEP_USE_FLASH_ATTENTION='false', ACESTEP_COMPILE_MODEL='false', ACESTEP_NO_INIT='true', HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', CUDA_MODULE_LOADING='LAZY')
    os.environ['ACESTEP_API_KEY'] = os.environ.pop('METROFORGE_ACE_SESSION_KEY')
    import torch
    if not torch.cuda.is_available():
        raise ValueError('CUDA music runtime is unavailable; unsafe automatic CPU loading is disabled')
    from acestep.model_downloader import check_main_model_exists
    if not check_main_model_exists(weights):
        raise ValueError('Install the reviewed DiT-only SDK checkpoint fix before starting')
    from acestep.api_server import main as serve
    sys.argv = ['ace_step_api_worker', '--host', endpoint.hostname, '--port', str(endpoint.port), '--no-init', '--download-source', 'huggingface']
    serve()


if __name__ == '__main__':
    main()
