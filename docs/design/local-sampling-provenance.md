# Local sampling requests and provenance

Image requests may explicitly select guidance and scheduler. Diffusers forwards guidance from0 to50 and PNDM/Euler/DDIM scheduler choices, configures the actual pipeline and verifies its execution echo. Omitted controls retain model-native behavior. Turbo models require zero guidance. Reused pipelines restore their original scheduler when subsequent requests omit the choice.

Immutable local execution forwards width, height, steps, guidance, scheduler and seed, and requires actual matching metadata. Missing or changed values and procedural placeholders fail instead of recording requested values as executed. Request hashes therefore distinguish the executed sampling recipe rather than disguising a provider's defaults.

For the exact known stabilityai/stable-diffusion-xl-base-1.0 model, omitted production-spec fields resolve to20steps/Euler/guidance5, matching the tested model-native app recipe. Explicit fields always take precedence. Other model defaults retain their previous recipe; they require their own validation. A technically valid recipe can still produce unusable art.

Persistent OpenVINO execution uses requested guidance with its supported PNDM loop and emits effective fields. Unsupported schedulers reject before warmup. Its CPU tests use synthetic compiled graphs and real scheduler math; they do not establish OpenVINO model/GPU acceptance when the model cache is unavailable. The fixed direct OpenVINO diagnostic rejects sampling overrides.

Real cached SDXL/CUDA checks exercised explicit6/PNDM/7.5 and production-default20/Euler/5 requests. Both matched execution metadata; the six-step image failed visual review. The default recipe matched the established source bytes, and actual Workshop source/compiled output remained unchanged. These checks do not approve character palette, animation, engine gameplay or production readiness.
