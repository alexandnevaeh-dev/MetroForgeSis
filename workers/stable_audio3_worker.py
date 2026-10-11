"""One bounded authoring request; dedicated Stable Audio 3 environment, local weights only."""
import base64
import contextlib
import io
import json
import math
import os
from pathlib import Path
import sys

MODEL = 'stabilityai/stable-audio-3-small-sfx'


def main():
    raw = sys.stdin.buffer.read(8193)
    if len(raw) > 8192:
        raise ValueError('Oversized request')
    request = json.loads(raw)
    prompt, duration, seed = request['prompt'], request['duration'], request['seed']
    if request.get('kind') != 'sfx' or not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 1500:
        raise ValueError('Invalid effect request')
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or not 0.25 <= duration <= 10:
        raise ValueError('Invalid duration')
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2147483647:
        raise ValueError('Invalid seed')
    settings_path = Path(os.environ['METROFORGE_LOCAL_AUDIO_CONFIG'])
    if not settings_path.is_absolute() or settings_path.stat().st_size > 16384:
        raise ValueError('Invalid runtime configuration')
    settings = json.loads(settings_path.read_text(encoding='utf-8-sig'))
    if settings.get('sfxTorchPath'):
        fallback = Path(settings['sfxTorchPath'])
        if not fallback.is_absolute() or not (fallback / 'torch' / '__init__.py').is_file():
            raise ValueError('Invalid fallback runtime')
        sys.path.insert(0, str(fallback))
    root = Path(settings['sfxModelRoot'])
    if not root.is_absolute() or not (root / 'model.safetensors').is_file():
        raise ValueError('Local weights are missing')
    # A generation request cannot initiate another network download or import remote code.
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    with contextlib.redirect_stdout(sys.stderr):
        print('LOCAL_AUDIO_PHASE imports', file=sys.stderr, flush=True)
        import numpy as np
        import soundfile as sf
        import torch
        from stable_audio_3 import StableAudioModel
        from stable_audio_3.loading_utils import load_diffusion_cond
        config = json.loads((root / 'model_config.json').read_text(encoding='utf-8'))
        for condition in config['model']['conditioning']['configs']:
            if condition['type'] == 't5gemma':
                condition['config']['model_path'] = str(root / 't5gemma-b-b-ul2')
                condition['config'].pop('repo_id', None)
                condition['config'].pop('subfolder', None)
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        half = device == 'cuda'
        print('LOCAL_AUDIO_PHASE loading_' + device, file=sys.stderr, flush=True)
        loaded = load_diffusion_cond(config, str(root / 'model.safetensors'), device=device, model_half=half)
        loaded.use_lora = False
        loaded.lora_names = []
        model = StableAudioModel(loaded, config, device, half)
        print('LOCAL_AUDIO_PHASE generating', file=sys.stderr, flush=True)
        audio = model.generate(prompt=prompt, duration=duration, seed=seed, steps=8, batch_size=1, chunked_decode=True)
        samples = audio[0].detach().float().cpu().numpy().T
        if samples.ndim != 2 or samples.shape[1] not in (1, 2) or not np.isfinite(samples).all():
            raise ValueError('Invalid model samples')
        peak = float(np.abs(samples).max())
        if peak > 0.98:
            samples *= 0.98 / peak
        out = io.BytesIO()
        sf.write(out, samples, model.model.sample_rate, format='WAV', subtype='PCM_16')
        encoded = base64.b64encode(out.getvalue()).decode('ascii')
    print(json.dumps({'ok': True, 'model': MODEL, 'actual_device': device, 'audio_base64': encoded}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never return provider exceptions that might contain authorization headers or paths.
        print('LOCAL_AUDIO_FAILURE ' + type(error).__name__, file=sys.stderr, flush=True)
        print(json.dumps({'ok': False, 'model': MODEL, 'error': 'Local SFX generation failed'}), flush=True)
        sys.exit(1)
