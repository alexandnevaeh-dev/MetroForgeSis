import hashlib, json, os, time
from pathlib import Path
import psutil
from optimum.intel.openvino import OVDiffusionPipeline

root=Path(__file__).resolve().parent.parent
model=root/'models'/'openvino'/'3bc9c7f7b000b0ba'
out=root/'test-artifacts'/'asset-pipeline-v2-local-preview'/'benchmark'
started=time.perf_counter()
size=int(os.environ.get('METROFORGE_PREVIEW_SIZE','128'))
pipe=OVDiffusionPipeline.from_pretrained(model,device='CPU',compile=False,safety_checker=None)
loaded=time.perf_counter()
pipe.reshape(batch_size=1,height=size,width=size,num_images_per_prompt=1)
pipe.compile();compiled=time.perf_counter()
image=pipe('premium 2D side-view futuristic metro explorer, graphite protective suit, restrained cyan accents, clear silhouette, isolated full body, coherent game concept art, no text',negative_prompt='photorealism, watermark, typography, cropped body, duplicate limbs, cluttered background',width=size,height=size,num_inference_steps=20,guidance_scale=7.5).images[0]
generated=time.perf_counter();path=out/f'preview-{size}-20-optimum.png';image.save(path);raw=path.read_bytes()
record={'model':'OpenVINO/stable-diffusion-v1-5-int8-ov','precision':'int8_weights_fp32_compute','runtime':'OVDiffusionPipeline','device':'CPU','width':size,'height':size,'steps':20,'scheduler':'PNDM','loadMs':round((loaded-started)*1000),'compileMs':round((compiled-loaded)*1000),'generationMs':round((generated-compiled)*1000),'totalMs':round((generated-started)*1000),'availableRamMb':round(psutil.virtual_memory().available/1048576,1),'sourceHash':hashlib.sha256(raw).hexdigest(),'path':str(path)}
(out/f'optimum-probe-{size}.json').write_text(json.dumps(record,indent=2));print(json.dumps(record,indent=2))
