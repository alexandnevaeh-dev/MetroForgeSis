"""Fast prompt-budget regression tests; real-model checks are recorded separately."""
import importlib.util
from pathlib import Path
import unittest

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

if __name__ == "__main__": unittest.main()
