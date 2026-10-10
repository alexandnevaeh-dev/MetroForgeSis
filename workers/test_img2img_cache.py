import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch, Mock
import diffusers_image_worker as worker


class Img2ImgCache(unittest.TestCase):
    def test_uses_prepared_absolute_fp16_snapshot_offline_and_reuses_cache(self):
        os.makedirs('E:/MetroForgeData/Temp/img2img-cache-tests', exist_ok=True)
        with tempfile.TemporaryDirectory(dir='E:/MetroForgeData/Temp/img2img-cache-tests') as snapshot:
            os.makedirs(os.path.join(snapshot, 'unet'))
            with open(os.path.join(snapshot, 'unet', 'diffusion_pytorch_model.fp16.safetensors'), 'wb') as file:
                file.write(b'fixture')
            loader = Mock(return_value=object())
            worker._img2img_pipeline = None
            worker._img2img_pipeline_key = None
            with patch.dict(sys.modules, {'diffusers': SimpleNamespace(AutoPipelineForImage2Image=SimpleNamespace(from_pretrained=loader))}), \
                 patch.object(worker, '_ensure_model_available', return_value={'model_path': snapshot}), \
                 patch.object(worker, '_torch_dtype', return_value='fp16'), \
                 patch.object(worker, '_offload_strategy', return_value='model'), \
                 patch.object(worker, '_apply_local_style', side_effect=lambda pipe, style: pipe), \
                 patch.object(worker, '_move_pipe', side_effect=lambda pipe, device: pipe):
                first = worker.get_img2img_pipeline('stabilityai/stable-diffusion-xl-base-1.0', 'cuda')
                self.assertIs(first, worker.get_img2img_pipeline('stabilityai/stable-diffusion-xl-base-1.0', 'cuda'))
                loader.assert_called_once_with(snapshot, torch_dtype='fp16', local_files_only=True, variant='fp16')
            worker._img2img_pipeline = None
            worker._img2img_pipeline_key = None


if __name__ == '__main__':
    unittest.main()
