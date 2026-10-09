"""Hash admission/cache regressions; this does not claim CUDA inference."""
import hashlib
import importlib.util
import tempfile
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("worker", Path(__file__).with_name("diffusers_image_worker.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class HashingTests(unittest.TestCase):
    def test_admits_matching_adapter_and_rejects_changed_bytes(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "test.safetensors"
            path.write_bytes(b"hash-contract-fixture")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            value = {"path": str(path.resolve()), "sha256": digest, "scale": 0.5}
            self.assertEqual(worker._local_style_adapter(value)["sha256"], digest)
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "HASH_MISMATCH"):
                worker._local_style_adapter(value)

    def test_absent_adapter_and_invalid_scale_keep_their_contract(self):
        self.assertIsNone(worker._local_style_adapter(None))
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "test.safetensors"
            path.write_bytes(b"test")
            with self.assertRaisesRegex(ValueError, "INVALID_SCALE"):
                worker._local_style_adapter({"path": str(path.resolve()), "sha256": "0" * 64, "scale": True})

    def test_openvino_cache_identity_stays_stable_and_revision_specific(self):
        model = "OpenVINO/test-model"
        expected = hashlib.sha256(f"{model}|main|int8|openvino".encode()).hexdigest()[:16]
        self.assertEqual(Path(worker._openvino_model_path(model, None)).name, expected)
        self.assertNotEqual(worker._openvino_model_path(model, None), worker._openvino_model_path(model, "candidate"))

if __name__ == "__main__":
    unittest.main()
