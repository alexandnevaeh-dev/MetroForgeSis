"""Execute the real generate function with synthetic compiled graphs, not OpenVINO hardware."""
import ast
import base64
import time
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
import unittest
import numpy as np
from diffusers import PNDMScheduler
from image_sampling import validate_sampling_request


class Tokenizer:
    model_max_length = 77
    def __call__(self, *args, **kwargs):
        return SimpleNamespace(input_ids=np.zeros((2, 77), dtype=np.int64))


class OpenVinoSamplingLoop(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root=Path('E:/MetroForgeData/Development/stormglass-sampling-provenance-20261009/openvino-loop-fixture')
        PNDMScheduler(skip_prk_steps=True).save_pretrained(root/'scheduler')
        tree=ast.parse(Path(__file__).with_name('openvino_direct_server.py').read_text())
        function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='generate')
        def unet(data):
            shape=data['sample'].shape
            output=np.zeros(shape,dtype=np.float32)
            output[1]=1
            return {'noise':output}
        def vae(data):
            decoded=np.tanh(data['latent_sample'][:,:3]/20)
            return {'image':np.repeat(np.repeat(decoded,8,axis=2),8,axis=3)}
        cls.warmups=[]
        cls.scope={'time':time,'base64':base64,'BytesIO':BytesIO,'MODEL_ROOT':root,'validate_sampling_request':validate_sampling_request,'_diagnostic_path':None,'_state':'PREPARED',
            'diagnostic':lambda *a,**k:None,'memory':lambda:{},'readiness':lambda:{},
            'warmup':lambda req:(cls.warmups.append(req) or {'compileCacheHit':True,'timings':{}}),
            '_runtime':{'device':'SYNTHETIC_CPU','tokenizer':Tokenizer(),'compiled':{'text_encoder':lambda data:{'embedding':np.zeros((2,77,1),dtype=np.float32)},'unet':unet,'vae_decoder':vae}}}
        exec(compile(ast.Module(body=[function],type_ignores=[]),'actual-openvino-generate','exec'),cls.scope)

    def request(self,**extras):
        return {'model_id':'sd-1.5','width':128,'height':128,'steps':6,'seed':42,'prompt':'fixture',**extras}

    def test_explicit_guidance_changes_executed_loop_and_default_is_preserved(self):
        generate=self.scope['generate']
        original=generate(self.request())
        explicit=generate(self.request(guidance=7.5,scheduler='PNDM'))
        changed=generate(self.request(guidance=3,scheduler='PNDM'))
        self.assertEqual(original['image_base64'],explicit['image_base64'])
        self.assertNotEqual(original['image_base64'],changed['image_base64'])
        self.assertEqual(changed['effectiveGuidance'],3)
        self.assertEqual(changed['effectiveScheduler'],'PNDM')
        self.assertEqual(changed['effectiveSteps'],6)
        self.assertEqual(changed['effectiveWidth'],128)

    def test_unsupported_scheduler_rejects_before_warmup(self):
        count=len(self.warmups)
        with self.assertRaisesRegex(RuntimeError,'only PNDM'):
            self.scope['generate'](self.request(scheduler='Euler'))
        self.assertEqual(len(self.warmups),count)


if __name__=='__main__':
    unittest.main()
