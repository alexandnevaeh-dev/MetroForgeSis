"""Exercise real worker branch logic with fake inference; not GPU/model evidence."""
import ast,base64,json,sys,time,types,unittest
from io import BytesIO
from pathlib import Path
from typing import Any
class Image:
 width=8;height=8
 def save(self,buffer,format):buffer.write(b'fake-test-image')
class Pipe:
 guidance_scale=5
 def __init__(self):self.calls=[]
 def __call__(self,**kwargs):self.calls.append(kwargs);return types.SimpleNamespace(images=[Image()])
 def set_ip_adapter_scale(self,value):self.scale=value
class Generator:
 def __init__(self,**kwargs):pass
 def manual_seed(self,seed):return self
class ConditioningTest(unittest.TestCase):
 def test_branches(self):
  source=Path(__file__).resolve().parents[1]/'workers/diffusers_image_worker.py'
  node=next(n for n in ast.parse(source.read_text(encoding='utf-8')).body if isinstance(n,ast.FunctionDef) and n.name=='generate_image')
  old=sys.modules.get('torch');sys.modules['torch']=types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda:True),Generator=Generator)
  try:
   for mode,present,expected in [(None,False,None),('img2img',False,None),('img2img',True,'img2img'),('controlnet_canny',True,'controlnet_canny'),('ip_adapter',True,'ip_adapter')]:
    with self.subTest(mode=mode,present=present):
     pipe=Pipe();env=dict(Any=Any,time=time,BytesIO=BytesIO,base64=base64,os=types.SimpleNamespace(environ={}),SDXL_BASE_MODEL_ID='test',_resolve_backend=lambda req:'cuda',_prepare_init_image=lambda *args:Image() if present else None,_torch_dtype=lambda device:'float16',_offload_strategy=lambda device:'none',_assert_prompt_budget=lambda *args:None,_ensure_model_available=lambda *args:{},check_prompt=lambda req:{'anyOverflow':False},_canny_control_image=lambda image:image)
     for name in ['get_pipeline','get_img2img_pipeline','get_controlnet_pipeline','get_ip_adapter_pipeline']:env[name]=lambda *args,**kwargs:pipe
     exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),'exec'),env)
     result=env['generate_image']({'model_id':'test','conditioning_mode':mode,'conditioning_strength':.4,'steps':24,'width':8,'height':8})
     self.assertEqual(result['effectiveConditioningMode'],expected)
     self.assertEqual(result['effectiveConditioningStrength'],.4 if expected else None)
     call=pipe.calls[0]
     if expected=='img2img':self.assertEqual(call['strength'],.4)
     elif expected=='controlnet_canny':self.assertEqual(call['controlnet_conditioning_scale'],.4)
     elif expected=='ip_adapter':self.assertEqual(pipe.scale,.4)
     else:self.assertNotIn('image',call)
  finally:
   if old is None:sys.modules.pop('torch',None)
   else:sys.modules['torch']=old
if __name__=='__main__':unittest.main()