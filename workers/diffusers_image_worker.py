#!/usr/bin/env python3

"""Local SDXL image generation worker for MetroForge AI.



Reads JSON from stdin, writes JSON to stdout.

Actions: health, generate



Requires: pip install -r workers/requirements-diffusers.txt

"""



from __future__ import annotations



import base64

import json

import os

import sys

from io import BytesIO

from typing import Any





PROFILE_PREFIXES: dict[str, str] = {

    "CHARACTER": "pixel art game character sprite, side view,",

    "ENEMY": "pixel art game enemy creature, side view,",

    "BOSS": "pixel art game boss creature, imposing,",

    "TILE_SOURCE": "seamless pixel art game tileset texture, top-down,",

    "ENVIRONMENT": "pixel art game environment background, parallax,",

    "ICON": "pixel art game item icon, centered,",

}



SDXL_BASE_MODEL_ID = os.environ.get(

    "DIFFUSERS_SDXL_BASE_MODEL_ID", "stabilityai/stable-diffusion-xl-base-1.0"

)

CONTROLNET_MODEL_ID = os.environ.get(

    "DIFFUSERS_CONTROLNET_MODEL_ID", "diffusers/controlnet-canny-sdxl-1.0"

)

IP_ADAPTER_REPO = os.environ.get("DIFFUSERS_IP_ADAPTER_REPO", "h94/IP-Adapter")

IP_ADAPTER_WEIGHT = os.environ.get(

    "DIFFUSERS_IP_ADAPTER_WEIGHT", "ip-adapter_sdxl.bin"

)





def read_request() -> dict[str, Any]:

    raw = sys.stdin.read()

    if not raw.strip():

        raise ValueError("empty stdin")

    return json.loads(raw)





def write_response(payload: dict[str, Any]) -> None:

    sys.stdout.write(json.dumps(payload))

    sys.stdout.flush()





def health_check() -> dict[str, Any]:

    try:

        import torch  # noqa: F401

        import diffusers  # noqa: F401



        cuda = False

        try:

            import torch



            cuda = torch.cuda.is_available()

        except Exception:

            cuda = False

        return {"ok": True, "cuda": cuda, "provider": "diffusers"}

    except ImportError as exc:

        return {"ok": False, "error": str(exc), "provider": "diffusers"}





_pipeline = None

_img2img_pipeline = None

_controlnet_pipeline = None

_ip_adapter_pipeline = None





def _torch_dtype():

    import torch



    return torch.float16 if torch.cuda.is_available() else torch.float32





def _move_pipe(pipe):

    import torch



    if torch.cuda.is_available():

        return pipe.to("cuda")

    pipe.enable_model_cpu_offload()

    return pipe





def get_pipeline(model_id: str):

    global _pipeline

    if _pipeline is not None:

        return _pipeline



    import torch

    from diffusers import AutoPipelineForText2Image



    pipe = AutoPipelineForText2Image.from_pretrained(model_id, torch_dtype=_torch_dtype())

    _pipeline = _move_pipe(pipe)

    return _pipeline





def get_img2img_pipeline(model_id: str):

    global _img2img_pipeline

    if _img2img_pipeline is not None:

        return _img2img_pipeline



    from diffusers import AutoPipelineForImage2Image



    pipe = AutoPipelineForImage2Image.from_pretrained(model_id, torch_dtype=_torch_dtype())

    _img2img_pipeline = _move_pipe(pipe)

    return _img2img_pipeline





def get_controlnet_pipeline(base_model_id: str):

    global _controlnet_pipeline

    if _controlnet_pipeline is not None:

        return _controlnet_pipeline



    from diffusers import ControlNetModel, StableDiffusionXLControlNetPipeline



    controlnet = ControlNetModel.from_pretrained(

        CONTROLNET_MODEL_ID, torch_dtype=_torch_dtype()

    )

    pipe = StableDiffusionXLControlNetPipeline.from_pretrained(

        base_model_id,

        controlnet=controlnet,

        torch_dtype=_torch_dtype(),

    )

    _controlnet_pipeline = _move_pipe(pipe)

    return _controlnet_pipeline





def get_ip_adapter_pipeline(base_model_id: str):

    global _ip_adapter_pipeline

    if _ip_adapter_pipeline is not None:

        return _ip_adapter_pipeline



    from diffusers import StableDiffusionXLPipeline



    pipe = StableDiffusionXLPipeline.from_pretrained(

        base_model_id, torch_dtype=_torch_dtype()

    )

    pipe.load_ip_adapter(

        IP_ADAPTER_REPO,

        subfolder="sdxl_models",

        weight_name=IP_ADAPTER_WEIGHT,

    )

    _ip_adapter_pipeline = _move_pipe(pipe)

    return _ip_adapter_pipeline





def _prepare_init_image(req: dict[str, Any], width: int, height: int):

    from PIL import Image



    init_b64 = req.get("init_image_base64")

    if not init_b64:

        return None



    raw = base64.b64decode(init_b64)

    image = Image.open(BytesIO(raw)).convert("RGB")

    return image.resize((width, height))





def _canny_control_image(image):

    """Build a Canny edge map suitable for SDXL ControlNet."""

    try:

        import cv2

        import numpy as np



        arr = np.array(image.convert("RGB"))

        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)

        edges = cv2.Canny(gray, 100, 200)

        edges_rgb = np.stack([edges, edges, edges], axis=-1)

        from PIL import Image



        return Image.fromarray(edges_rgb)

    except ImportError:

        from PIL import ImageFilter



        return image.convert("L").filter(ImageFilter.FIND_EDGES).convert("RGB")





def generate_image(req: dict[str, Any]) -> dict[str, Any]:

    model_id = req.get("model_id", "stabilityai/sdxl-turbo")

    profile = req.get("profile", "CHARACTER")

    prompt = req.get("prompt", "pixel art game asset")

    negative = req.get("negative_prompt", "blurry, low quality, text, watermark")

    width = int(req.get("width", 512))

    height = int(req.get("height", 512))

    seed = int(req.get("seed", 42))

    steps = int(req.get("steps", 4 if "turbo" in model_id else 20))



    prefix = PROFILE_PREFIXES.get(profile, "pixel art game asset,")

    full_prompt = f"{prefix} {prompt}"



    init_image = _prepare_init_image(req, width, height)

    conditioning_mode = req.get("conditioning_mode")

    strength = float(req.get("conditioning_strength", 0.65))



    import torch



    generator = torch.Generator(

        device="cuda" if torch.cuda.is_available() else "cpu"

    ).manual_seed(seed)



    if init_image is not None and conditioning_mode == "controlnet_canny":

        pipe = get_controlnet_pipeline(SDXL_BASE_MODEL_ID)

        control_image = _canny_control_image(init_image)

        result = pipe(

            prompt=full_prompt,

            negative_prompt=negative,

            image=control_image,

            controlnet_conditioning_scale=strength,

            width=width,

            height=height,

            num_inference_steps=max(steps, 20),

            generator=generator,

        )

    elif init_image is not None and conditioning_mode == "ip_adapter":

        pipe = get_ip_adapter_pipeline(SDXL_BASE_MODEL_ID)

        pipe.set_ip_adapter_scale(strength)

        result = pipe(

            prompt=full_prompt,

            negative_prompt=negative,

            ip_adapter_image=init_image,

            width=width,

            height=height,

            num_inference_steps=max(steps, 20),

            generator=generator,

        )

    elif init_image is not None and conditioning_mode:

        pipe = get_img2img_pipeline(model_id)

        result = pipe(

            prompt=full_prompt,

            negative_prompt=negative,

            image=init_image,

            strength=strength,

            width=width,

            height=height,

            num_inference_steps=steps,

            generator=generator,

        )

    else:

        pipe = get_pipeline(model_id)

        result = pipe(

            prompt=full_prompt,

            negative_prompt=negative,

            width=width,

            height=height,

            num_inference_steps=steps,

            generator=generator,

        )



    image = result.images[0]

    buf = BytesIO()

    image.save(buf, format="PNG")



    return {

        "ok": True,

        "provider": "diffusers",

        "model_id": model_id,

        "seed": seed,

        "conditioning_mode": conditioning_mode,

        "image_base64": base64.b64encode(buf.getvalue()).decode("ascii"),

    }





def main() -> None:

    req = read_request()

    action = req.get("action", "health")



    if action == "health":

        write_response(health_check())

        return



    if action == "generate":

        try:

            write_response(generate_image(req))

        except Exception as exc:

            write_response({"ok": False, "error": str(exc), "provider": "diffusers"})

        return



    write_response({"ok": False, "error": f"unknown action: {action}"})





if __name__ == "__main__":

    main()


