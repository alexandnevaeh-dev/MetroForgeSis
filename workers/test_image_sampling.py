import unittest
from types import SimpleNamespace
from unittest.mock import patch
from image_sampling import configure_sampling, effective_scheduler, validate_sampling_request


class EulerDiscreteScheduler:
    config = {"prediction_type": "epsilon"}


class PNDMScheduler:
    @classmethod
    def from_config(cls, config):
        instance = cls()
        instance.config = dict(config)
        return instance


class SamplingContract(unittest.TestCase):
    def test_defaults_preserve_scheduler_and_model_native_guidance(self):
        original = EulerDiscreteScheduler()
        pipe = SimpleNamespace(scheduler=original)
        self.assertEqual(configure_sampling({}, pipe, "sdxl-base"), {})
        self.assertIs(pipe.scheduler, original)
        self.assertEqual(effective_scheduler(pipe), "Euler")

    def test_explicit_request_changes_scheduler_and_next_default_restores_it(self):
        original = EulerDiscreteScheduler()
        pipe = SimpleNamespace(scheduler=original)
        with patch.dict("sys.modules", {"diffusers": SimpleNamespace(PNDMScheduler=PNDMScheduler)}):
            self.assertEqual(configure_sampling({"scheduler": "PNDM", "guidance": 7.5}, pipe, "sdxl-base"), {"guidance_scale": 7.5})
        self.assertEqual(effective_scheduler(pipe), "PNDM")
        self.assertEqual(pipe.scheduler.config, original.config)
        configure_sampling({}, pipe, "sdxl-base")
        self.assertIs(pipe.scheduler, original)

    def test_zero_is_not_treated_as_omitted(self):
        self.assertEqual(configure_sampling({"guidance": 0}, SimpleNamespace(scheduler=EulerDiscreteScheduler()), "sdxl-base"), {"guidance_scale": 0.0})

    def test_turbo_requires_zero_and_rejects_before_mutation(self):
        original = EulerDiscreteScheduler()
        pipe = SimpleNamespace(scheduler=original)
        with self.assertRaisesRegex(ValueError, "zero guidance"):
            configure_sampling({"guidance": 7.5, "scheduler": "PNDM"}, pipe, "sdxl-turbo")
        self.assertIs(pipe.scheduler, original)
        self.assertEqual(configure_sampling({}, pipe, "sdxl-turbo"), {"guidance_scale": 0.0})

    def test_invalid_parameters_are_rejected(self):
        for value in [None, True, "7.5", -1, 51, float("nan"), float("inf")]:
            with self.subTest(guidance=value), self.assertRaises(ValueError):
                validate_sampling_request({"guidance": value})
        for value in [None, [], "unknown"]:
            with self.subTest(scheduler=value), self.assertRaises(ValueError):
                validate_sampling_request({"scheduler": value})


if __name__ == "__main__":
    unittest.main()
