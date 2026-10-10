"""Explicit sampling controls; omitted fields preserve model-native defaults."""
import math

SCHEDULERS = {"PNDM": "PNDMScheduler", "Euler": "EulerDiscreteScheduler", "DDIM": "DDIMScheduler"}


def validate_sampling_request(req):
    if "guidance" in req:
        value = req["guidance"]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 50:
            raise ValueError("Guidance must be a finite number from 0 to 50")
    if "scheduler" in req and (not isinstance(req["scheduler"], str) or req["scheduler"] not in SCHEDULERS):
        raise ValueError("Unsupported requested scheduler")


def configure_sampling(req, pipe, model_id):
    validate_sampling_request(req)
    if "guidance" in req and "turbo" in model_id.lower() and req["guidance"] != 0:
        raise ValueError("Turbo models require zero guidance")
    if not hasattr(pipe, "_metroforge_default_scheduler"):
        pipe._metroforge_default_scheduler = pipe.scheduler
    pipe.scheduler = pipe._metroforge_default_scheduler
    if "scheduler" in req:
        import diffusers
        factory = getattr(diffusers, SCHEDULERS[req["scheduler"]])
        pipe.scheduler = factory.from_config(pipe._metroforge_default_scheduler.config)
    options = {}
    if "guidance" in req:
        options["guidance_scale"] = float(req["guidance"])
    elif "turbo" in model_id.lower():
        options["guidance_scale"] = 0.0
    return options


def effective_scheduler(pipe):
    name = type(pipe.scheduler).__name__
    return next((alias for alias, classname in SCHEDULERS.items() if classname == name), name)
