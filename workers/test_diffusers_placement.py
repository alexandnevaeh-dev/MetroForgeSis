"""Placement contract checks; GPU inference is validated separately."""
import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("worker", Path(__file__).with_name("diffusers_image_worker.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class PlacementTests(unittest.TestCase):
    def test_default_cuda_uses_direct_placement(self):
        pipe = Mock()
        with patch.dict(os.environ, {"DIFFUSERS_CPU_OFFLOAD": "0"}), patch.dict(sys.modules, {"torch": Mock()}):
            self.assertIs(worker._move_pipe(pipe, "cuda"), pipe.to.return_value)
        pipe.to.assert_called_once_with("cuda")
        pipe.enable_model_cpu_offload.assert_not_called()

    def test_offload_never_preloads_full_model_on_cuda(self):
        pipe = Mock()
        with patch.dict(os.environ, {"DIFFUSERS_CPU_OFFLOAD": "true"}), patch.dict(sys.modules, {"torch": Mock()}):
            self.assertIs(worker._move_pipe(pipe, "cuda"), pipe)
        pipe.to.assert_not_called()
        pipe.enable_model_cpu_offload.assert_called_once_with()
        pipe.enable_vae_slicing.assert_called_once_with()
        pipe.enable_vae_tiling.assert_called_once_with()

    def test_unsupported_offload_fails_explicitly(self):
        with patch.dict(os.environ, {"DIFFUSERS_CPU_OFFLOAD": "1"}), patch.dict(sys.modules, {"torch": Mock()}):
            with self.assertRaisesRegex(RuntimeError, "OFFLOAD_UNSUPPORTED"):
                worker._move_pipe(object(), "cuda")

    def test_cpu_does_not_request_cuda_offload(self):
        pipe = Mock()
        with patch.dict(os.environ, {"DIFFUSERS_CPU_OFFLOAD": "1"}), patch.dict(sys.modules, {"torch": Mock()}):
            worker._move_pipe(pipe, "cpu")
            self.assertFalse(worker._cpu_offload_enabled("cpu"))
        pipe.to.assert_called_once_with("cpu")
        pipe.enable_model_cpu_offload.assert_not_called()

    def test_cache_reloads_when_placement_policy_changes(self):
        loader = Mock()
        fake_diffusers = Mock(AutoPipelineForText2Image=loader)
        worker._pipeline = None
        worker._pipeline_key = None
        with patch.dict(sys.modules, {"diffusers": fake_diffusers}), patch.object(worker, "_torch_dtype", return_value="float16"), patch.object(worker, "_move_pipe", side_effect=lambda pipe, device: pipe):
            with patch.dict(os.environ, {"DIFFUSERS_CPU_OFFLOAD": "0"}):
                worker.get_pipeline("fixture", "cuda")
                worker.get_pipeline("fixture", "cuda")
                self.assertEqual(loader.from_pretrained.call_count, 1)
            with patch.dict(os.environ, {"DIFFUSERS_CPU_OFFLOAD": "1"}):
                worker.get_pipeline("fixture", "cuda")
                self.assertEqual(loader.from_pretrained.call_count, 2)


if __name__ == "__main__":
    unittest.main()
