"""Meaningful local adapter admission/cache separation tests; no GPU or network."""
import copy
import importlib.util
import json
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
module_spec = importlib.util.spec_from_file_location('quantum_style_worker_test', repo / 'workers/diffusers_image_worker.py')
worker = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(worker)
good = {'path':'E:/MetroForgeData/Models/nerijs-pixel-art-xl/pixel-art-xl.safetensors',
        'sha256':'4234637cb80c998f41e348e6a6cb6bc20d8d038b2b0f256b6129b3b5e353eef7','scale':0.85}
results = []
def check(condition, label):
    results.append({'test':label,'passed':condition})
check(worker._local_style_adapter(None) is None, 'Unrequested adapters preserve the existing generation path')
verified = worker._local_style_adapter(good)
check(verified['sha256'] == good['sha256'] and verified['scale'] == 0.85, 'Published model digest validates against actual installed bytes')
check(worker._style_key(None) != worker._style_key(verified), 'Styled and ordinary pipelines cannot share a cached model identity')
changed = {**verified,'scale':0.5}
check(worker._style_key(changed) != worker._style_key(verified), 'Different adapter strengths have distinct cached pipeline identities')
cases = [
    ('changed digest',{'sha256':'0'*64}), ('unknown field',{'extra':True}),
    ('nonfinite strength',{'scale':float('nan')}), ('infinite strength',{'scale':float('inf')}),
    ('boolean strength',{'scale':True}), ('excessive strength',{'scale':3}),
    ('zero strength',{'scale':0}), ('wrong format',{'path':'E:/MetroForgeData/Models/style.bin'}),
    ('relative path',{'path':'pixel-art-xl.safetensors'}), ('missing file',{'path':'E:/MetroForgeData/Models/absent.safetensors'}),
]
for label, update in cases:
    value = {**good,**update}
    try:
        worker._local_style_adapter(value)
        accepted = True
    except ValueError:
        accepted = False
    check(not accepted, 'Reject ' + label + ' before model loading')
class RecordingPipe:
    def __init__(self): self.calls = []
    def load_lora_weights(self,*args,**kwargs): self.calls.append(('load',args,kwargs))
    def set_adapters(self,*args,**kwargs): self.calls.append(('activate',args,kwargs))
plain = RecordingPipe()
worker._apply_local_style(plain,None)
check(not plain.calls, 'Default requests do not load or activate a style adapter')
styled = RecordingPipe()
worker._apply_local_style(styled,verified)
check(len(styled.calls) == 2 and styled.calls[0][2]['local_files_only'] is True and styled.calls[1][2]['adapter_weights'] == 0.85,
      'Explicit requests load only local weights and activate the verified strength')
result = {'passed':sum(item['passed'] for item in results),'failed':sum(not item['passed'] for item in results),'tests':results,
          'scope':'Adapter admission and cache isolation; not image quality or native inference proof'}
print(json.dumps(result))
raise SystemExit(0 if result['failed'] == 0 else 1)
