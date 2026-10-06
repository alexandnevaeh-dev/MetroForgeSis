"""Fast prompt-budget regression tests; real-model checks are recorded separately."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import types

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("diffusers_worker", ROOT / "workers/diffusers_image_worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class Tokenizer:
    def __init__(self, limit, extra=0):
        self.model_max_length = limit
        self.extra = extra
    def __call__(self, text, **options):
        assert options == {"truncation": False, "add_special_tokens": True}
        return {"input_ids": list(range(len(text.split()) + 2 + self.extra))}

class PromptBudgetTests(unittest.TestCase):
    def test_exact_boundary(self):
        result = worker._prompt_budget([Tokenizer(4)], "stone ledge", "")
        self.assertFalse(result["anyOverflow"])
        self.assertEqual(result["positive"]["tokenCount"], 4)
    def test_negative_is_independent(self):
        result = worker._prompt_budget([Tokenizer(4)], "stone", "one two three")
        self.assertFalse(result["positive"]["overflow"])
        self.assertEqual(result["negative"]["overflowBy"], 1)
    def test_second_encoder_overflow(self):
        result = worker._prompt_budget([Tokenizer(8), Tokenizer(4, 1)], "stone ledge", "")
        self.assertTrue(result["anyOverflow"])
        self.assertEqual(result["positive"]["overflowBy"], 1)
    def test_unbounded_or_missing_rejected(self):
        for tokenizers in ([], [Tokenizer(10**30)], [Tokenizer(0)]):
            with self.assertRaises(ValueError): worker._prompt_budget(tokenizers, "stone", "")
    def test_pipeline_guard(self):
        pipe = type("Pipeline", (), {"tokenizer": Tokenizer(4), "tokenizer_2": Tokenizer(4, 1)})()
        with self.assertRaisesRegex(ValueError, "exceeds model token budget"):
            worker._assert_prompt_budget(pipe, "stone ledge", "")

class OffloadTests(unittest.TestCase):
    def test_strategy_dispatch(self):
        class Pipe:
            def __init__(self): self.calls = []
            def enable_model_cpu_offload(self): self.calls.append("model")
            def enable_sequential_cpu_offload(self): self.calls.append("sequential")
            def enable_attention_slicing(self): self.calls.append("attention")
            def enable_vae_slicing(self): self.calls.append("vae")
            def enable_vae_tiling(self): self.calls.append("tiling")
            def to(self, device): self.calls.append(device); return self
        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda: True))
        for strategy in ("model", "sequential"):
            with self.subTest(strategy=strategy), patch.dict("sys.modules", {"torch": torch}), patch.dict("os.environ", {"DIFFUSERS_CPU_OFFLOAD": "1", "DIFFUSERS_OFFLOAD_STRATEGY": strategy}):
                pipe = Pipe()
                self.assertIs(worker._move_pipe(pipe, "cuda"), pipe)
                self.assertEqual(pipe.calls, [strategy, "attention", "vae", "tiling"])
    def test_offload_disabled(self):
        with patch.dict("os.environ", {"DIFFUSERS_CPU_OFFLOAD": "0", "DIFFUSERS_OFFLOAD_STRATEGY": "bad"}):
            self.assertEqual(worker._offload_strategy("cuda"), "none")
    def test_invalid_enabled_mode(self):
        with patch.dict("os.environ", {"DIFFUSERS_CPU_OFFLOAD": "1", "DIFFUSERS_OFFLOAD_STRATEGY": "bad"}):
            with self.assertRaises(ValueError): worker._offload_strategy("cuda")
    def test_unsupported_mode_fails(self):
        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda: True))
        with patch.dict("sys.modules", {"torch": torch}), patch.dict("os.environ", {"DIFFUSERS_CPU_OFFLOAD": "1", "DIFFUSERS_OFFLOAD_STRATEGY": "sequential"}):
            with self.assertRaisesRegex(RuntimeError, "OFFLOAD_UNSUPPORTED"):
                worker._move_pipe(object(), "cuda")

class OpenVinoResponseTests(unittest.TestCase):
    def test_preview_response_uses_openvino_telemetry(self):
        telemetry = {"actualDevice": "GPU", "precision": "FP16", "executionPath": "direct_openvino",
                     "textEncoderCompileMs": 1, "unetCompileMs": 2, "vaeCompileMs": 3,
                     "textEncoderInferenceMs": 4, "unetTotalInferenceMs": 5, "vaeInferenceMs": 6, "totalMs": 21}
        import json
        with patch.object(worker.subprocess, "run", return_value=types.SimpleNamespace(returncode=0)), \
             patch.object(Path, "read_text", return_value=json.dumps(telemetry)), \
             patch.object(Path, "read_bytes", return_value=b"fixture-image"):
            result = worker._generate_openvino_image({}, "preview", 384, 384, 6, 42)
        self.assertEqual(result["execution_path"], "direct_openvino")
        self.assertEqual(result["device"], "GPU")
        self.assertEqual(result["total_ms"], 21)
        self.assertEqual(result["compile_ms"], 6)
        self.assertEqual(result["inference_ms"], 15)
        self.assertEqual(result["image_base64"], "Zml4dHVyZS1pbWFnZQ==")

if __name__ == "__main__": unittest.main()
