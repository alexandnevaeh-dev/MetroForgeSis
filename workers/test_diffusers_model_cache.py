import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import diffusers_model_cache as cache

INDEX={"_class_name":"StableDiffusionXLPipeline","unet":["diffusers","UNet"],"text_encoder":["transformers","CLIP"],"tokenizer":["transformers","Tokenizer"],"scheduler":["diffusers","Scheduler"],"image_encoder":[None,None]}
FILES=["model_index.json","README.md","LICENSE.md","unet/config.json","unet/diffusion_pytorch_model.safetensors","unet/diffusion_pytorch_model.fp16.safetensors","text_encoder/config.json","text_encoder/model.safetensors","text_encoder/model.fp16.safetensors","tokenizer/vocab.json","tokenizer/merges.txt","scheduler/scheduler_config.json","unused/model.fp16.safetensors","example.png","unet/model.onnx"]
class ModelCacheTests(unittest.TestCase):
    def test_selects_half_precision_components_not_duplicate_full_weights_or_unused_assets(self):
        files,variant=cache.required_files(INDEX,FILES,"fp16")
        self.assertEqual(variant,"fp16")
        self.assertIn("unet/diffusion_pytorch_model.fp16.safetensors",files)
        for excluded in ["unet/diffusion_pytorch_model.safetensors","text_encoder/model.safetensors","unused/model.fp16.safetensors","example.png","unet/model.onnx"]:self.assertNotIn(excluded,files)
        self.assertIn("LICENSE.md",files)
    def test_full_precision_selects_only_normal_weights(self):
        files,variant=cache.required_files(INDEX,FILES,"fp32")
        self.assertIsNone(variant)
        self.assertIn("unet/diffusion_pytorch_model.safetensors",files)
        self.assertNotIn("unet/diffusion_pytorch_model.fp16.safetensors",files)
    def test_shards_keep_the_matching_index(self):
        files=FILES+["unet/diffusion_pytorch_model.fp16.safetensors.index.json","unet/diffusion_pytorch_model.safetensors.index.json","unet/diffusion_pytorch_model.fp16-00001-of-00002.safetensors"]
        selected,_=cache.required_files(INDEX,files,"fp16")
        self.assertIn("unet/diffusion_pytorch_model.fp16.safetensors.index.json",selected)
        self.assertNotIn("unet/diffusion_pytorch_model.safetensors.index.json",selected)
    def test_rejects_bad_paths_missing_weights_and_unknown_precision(self):
        for names in [FILES+["../secret"],FILES+["C:/secret"],FILES+["/secret"]]:
            with self.assertRaises(ValueError):cache.required_files(INDEX,names,"fp16")
        with self.assertRaises(ValueError):cache.required_files(INDEX,[p for p in FILES if not p.endswith(".safetensors")],"fp16")
        with self.assertRaises(ValueError):cache.required_files(INDEX,FILES,"int8")
    def test_prepared_resolution_is_offline_and_missing_files_invalidate_readiness(self):
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{"HF_HOME":tempfile.gettempdir()}):
            folder=Path(root);selected,variant=cache.required_files(INDEX,FILES,"fp16")
            for name in selected:
                file=folder/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text("fixture")
            (folder/"model_index.json").write_text(json.dumps(INDEX))
            model="test/unique-"+folder.name;descriptor=cache.descriptor_path(model);descriptor.parent.mkdir(parents=True,exist_ok=True)
            descriptor.write_text(json.dumps({"model_id":model,"model_path":str(folder),"files":selected,"variant":variant}))
            try:
                self.assertEqual(cache.read_prepared(model)["model_path"],str(folder))
                (folder/selected[-1]).unlink()
                with self.assertRaisesRegex(ValueError,"MODEL_PREPARATION_REQUIRED"):cache.read_prepared(model)
            finally:descriptor.unlink()
    def test_no_preparation_is_an_actionable_failure_without_downloading(self):
        with patch.dict(os.environ,{"HF_HOME":tempfile.gettempdir()}):
            with self.assertRaisesRegex(ValueError,"asset workshop"):cache.read_prepared("test/model-not-prepared")

if __name__=="__main__":unittest.main()
