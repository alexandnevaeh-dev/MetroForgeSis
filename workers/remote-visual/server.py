#!/usr/bin/env python3
"""Authenticated, single-flight MetroForge OpenVINO production worker."""
from __future__ import annotations
import base64, hashlib, hmac, json, os, platform, select, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

WORKER_VERSION=os.environ.get("METROFORGE_WORKER_VERSION","0.2.0")
PROTOCOL_VERSION="asset_generation_spec_v1"
MODEL_ID=os.environ.get("METROFORGE_REMOTE_MODEL","sd-1.5")
PRECISION=os.environ.get("METROFORGE_REMOTE_PRECISION","fp32")
DEVICE=os.environ.get("METROFORGE_OPENVINO_DEVICE","GPU").upper()
MODEL_ROOT=Path(os.environ.get("METROFORGE_OPENVINO_MODEL_ROOT","/models/openvino/sd-1.5"))
TOKEN=os.environ.get("METROFORGE_REMOTE_TOKEN")
MAX_BODY_BYTES=int(os.environ.get("METROFORGE_REMOTE_MAX_BODY_BYTES",str(1024*1024)))
MIN_TOTAL_RAM_MB=int(os.environ.get("METROFORGE_REMOTE_MIN_TOTAL_RAM_MB","12288"))
MIN_AVAILABLE_RAM_MB=int(os.environ.get("METROFORGE_REMOTE_MIN_AVAILABLE_RAM_MB","5400"))
MIN_GPU_MEMORY_MB=int(os.environ.get("METROFORGE_REMOTE_MIN_GPU_MEMORY_MB","4096"))
GENERATION_TIMEOUT_SECONDS=int(os.environ.get("METROFORGE_REMOTE_GENERATION_TIMEOUT_SECONDS","900"))
WORKER_SCRIPT=Path(os.environ.get("METROFORGE_OPENVINO_WORKER_SCRIPT","/app/openvino_direct_server.py"))
_generation_lock=threading.Lock(); _runtime_lock=threading.Lock()
_runtime: subprocess.Popen[str]|None=None
_runtime_warm=False

def canonical(value:Any)->str:
    if isinstance(value,list): return "["+",".join(canonical(x) for x in value)+"]"
    if isinstance(value,dict): return "{"+",".join(json.dumps(k,separators=(",",":"))+":"+canonical(value[k]) for k in sorted(value) if value[k] is not None)+"}"
    if isinstance(value,bool): return "true" if value else "false"
    if value is None:return "null"
    return json.dumps(value,separators=(",",":"),ensure_ascii=False)

def generation_spec(payload:dict[str,Any])->dict[str,Any]:
    c=payload.get("conditioning") or {}
    return {"version":PROTOCOL_VERSION,"model":payload.get("providerModel"),"prompt":payload.get("prompt"),"negativePrompt":payload.get("negativePrompt"),"seed":payload.get("seed"),"width":payload.get("width"),"height":payload.get("height"),"steps":c.get("steps"),"scheduler":c.get("scheduler"),"guidance":c.get("guidance"),"category":c.get("category"),"animation":c.get("animation"),"visualBibleVersion":c.get("visualBibleVersion"),"visualBibleHash":c.get("visualBibleHash"),"outputRole":payload.get("assetId")}

def request_hash(payload:dict[str,Any])->str:return hashlib.sha256(canonical(generation_spec(payload)).encode()).hexdigest()

def memory_profile()->dict[str,Any]:
    try:
        import psutil
        m=psutil.virtual_memory();return {"totalRamMb":round(m.total/1048576),"availableRamMb":round(m.available/1048576)}
    except Exception:return {"totalRamMb":0,"availableRamMb":0}

def openvino_profile()->dict[str,Any]:
    try:
        import openvino as ov
        return {"version":ov.__version__,"devices":ov.Core().available_devices}
    except Exception as exc:return {"version":None,"devices":[],"error":str(exc)}

def model_ready()->bool:
    return all((MODEL_ROOT/p).is_file() for p in ("model_index.json","tokenizer/tokenizer_config.json","scheduler/scheduler_config.json","text_encoder/openvino_model.xml","text_encoder/openvino_model.bin","unet/openvino_model.xml","unet/openvino_model.bin","vae_decoder/openvino_model.xml","vae_decoder/openvino_model.bin"))

def capacity_profile()->dict[str,Any]:
    memory=memory_profile();ov=openvino_profile();gpu_mb=int(os.environ.get("METROFORGE_GPU_VRAM_MB","0"));reasons=[]
    if MODEL_ID!="sd-1.5" or PRECISION!="fp32":reasons.append({"code":"UNSUPPORTED_MODEL","message":"Worker is pinned to sd-1.5 fp32"})
    if not model_ready():reasons.append({"code":"MODEL_NOT_INSTALLED","message":str(MODEL_ROOT)})
    if DEVICE!="AUTO" and DEVICE not in ov["devices"]:reasons.append({"code":"UNSUPPORTED_DEVICE","message":f"{DEVICE} not in {ov['devices']}"})
    if memory["totalRamMb"]<MIN_TOTAL_RAM_MB:reasons.append({"code":"INSUFFICIENT_MEMORY","observed":memory["totalRamMb"],"required":MIN_TOTAL_RAM_MB})
    if memory["availableRamMb"]<MIN_AVAILABLE_RAM_MB:reasons.append({"code":"INSUFFICIENT_AVAILABLE_MEMORY","observed":memory["availableRamMb"],"required":MIN_AVAILABLE_RAM_MB})
    if DEVICE=="GPU" and gpu_mb and gpu_mb<MIN_GPU_MEMORY_MB:reasons.append({"code":"INSUFFICIENT_DEVICE_MEMORY","observed":gpu_mb,"required":MIN_GPU_MEMORY_MB})
    return {"status":"SUPPORTED" if not reasons else "UNSUPPORTED_LOCAL_CAPACITY","reasons":reasons,**memory,"deviceMemoryMb":gpu_mb or None,"openvino":ov}

def admission(payload:dict[str,Any])->tuple[bool,str|None,dict[str,Any]]:
    spec=generation_spec(payload);profile=capacity_profile();actual=request_hash(payload);condition=payload.get("conditioning") or {}
    if payload.get("requestId")!=actual or condition.get("requestHash")!=actual:return False,"REQUEST_HASH_MISMATCH",profile
    if spec["model"]!=MODEL_ID:return False,"UNSUPPORTED_MODEL",profile
    if spec["width"]!=384 or spec["height"]!=384 or spec["steps"]!=6 or spec["scheduler"]!="PNDM" or spec["guidance"]!=7.5:return False,"UNSUPPORTED_IMMUTABLE_CONFIGURATION",profile
    if profile["status"]!="SUPPORTED":return False,"REMOTE_CAPACITY_INSUFFICIENT",profile
    return True,None,profile

def runtime_request(payload:dict[str,Any])->dict[str,Any]:
    global _runtime,_runtime_warm
    with _runtime_lock:
        if _runtime is None or _runtime.poll() is not None:
            env={**os.environ,"METROFORGE_OPENVINO_MODEL_ROOT":str(MODEL_ROOT)}
            _runtime=subprocess.Popen([os.environ.get("PYTHON","python3"),str(WORKER_SCRIPT)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=None,text=True,bufsize=1,env=env);_runtime_warm=False
        c=payload["conditioning"]
        req={"action":"generate","model_id":MODEL_ID,"prompt":payload["prompt"],"negative_prompt":payload.get("negativePrompt",""),"seed":payload["seed"],"width":payload["width"],"height":payload["height"],"steps":c["steps"],"scheduler":c["scheduler"],"guidance":c["guidance"],"openvino_device":DEVICE}
        assert _runtime.stdin and _runtime.stdout
        _runtime.stdin.write(json.dumps(req)+"\n");_runtime.stdin.flush();started=time.monotonic()
        while time.monotonic()-started<GENERATION_TIMEOUT_SECONDS:
            remaining=max(0,GENERATION_TIMEOUT_SECONDS-(time.monotonic()-started))
            readable,_,_=select.select([_runtime.stdout],[],[],remaining)
            if readable:
                line=_runtime.stdout.readline()
                if line:
                    try:result=json.loads(line)
                    except json.JSONDecodeError:
                        print(json.dumps({"at":time.time(),"event":"runtime_stdout_chatter","message":line.rstrip()[:500]}));continue
                    if not isinstance(result,dict) or "ok" not in result:
                        print(json.dumps({"at":time.time(),"event":"runtime_protocol_line_ignored"}));continue
                    result["workerWasWarm"]=_runtime_warm;_runtime_warm=bool(result.get("ok"));return result
            if _runtime.poll() is not None:break
        raise TimeoutError("GENERATION_TIMEOUT")

def generate(payload:dict[str,Any])->tuple[int,dict[str,Any]]:
    admitted,code,profile=admission(payload)
    if not admitted:return 422,{"success":False,"requestId":payload.get("requestId"),"errors":[code],"admission":profile}
    if not _generation_lock.acquire(blocking=False):return 429,{"success":False,"requestId":payload.get("requestId"),"errors":["BUSY"],"retryable":True}
    started=time.monotonic()
    try:
        result=runtime_request(payload)
        if not result.get("ok"):return 500,{"success":False,"requestId":payload["requestId"],"errors":[result.get("error","INFERENCE_FAILED")],"stage":"inference"}
        artifact=base64.b64decode(result["image_base64"],validate=True);source_hash=hashlib.sha256(artifact).hexdigest().upper();c=payload["conditioning"]
        effective={"width":payload["width"],"height":payload["height"],"steps":c["steps"],"scheduler":c["scheduler"],"guidance":c["guidance"],"seed":payload["seed"]}
        return 200,{"success":True,"requestId":payload["requestId"],"provider":"metroforge-openvino-worker","model":MODEL_ID,"seed":payload["seed"],"durationMs":round((time.monotonic()-started)*1000),"artifact":{"mimeType":"image/png","base64":base64.b64encode(artifact).decode(),"sha256":source_hash,"width":payload["width"],"height":payload["height"]},"executionTarget":{"id":os.environ.get("METROFORGE_WORKER_ID","openvino-production-worker"),"type":"REMOTE_METROFORGE_WORKER","location":"remote","provider":"metroforge-openvino-worker","gpuType":DEVICE,"capabilities":["IMAGE_GENERATION"],"health":"ready"},"provenance":{"protocolVersion":PROTOCOL_VERSION,"effectiveParameters":effective,"timings":result.get("timings",{}),"runtime":result.get("runtime",{}),"memory":result.get("memory",{}),"workerWasWarm":result.get("workerWasWarm",False),"sourceHash":source_hash},"warnings":[],"errors":[]}
    except TimeoutError:return 504,{"success":False,"requestId":payload.get("requestId"),"errors":["GENERATION_TIMEOUT"],"stage":"inference"}
    except Exception as exc:return 500,{"success":False,"requestId":payload.get("requestId"),"errors":[f"BACKEND_PROTOCOL_ERROR: {exc}"],"stage":"runtime"}
    finally:_generation_lock.release()

def health()->dict[str,Any]:
    profile=capacity_profile();return {"reachable":True,"workerVersion":WORKER_VERSION,"protocolVersion":PROTOCOL_VERSION,"status":"ready" if profile["status"]=="SUPPORTED" else "capacity_rejected","system":{"os":platform.platform(),"cpu":platform.processor(),**memory_profile()},"model":MODEL_ID,"precision":PRECISION,"device":DEVICE,"capacity":profile,"concurrencyLimit":1,"busy":_generation_lock.locked(),"modelWarm":_runtime_warm}

def capabilities()->dict[str,Any]:return {"worker":"metroforge-openvino-production","protocolVersion":PROTOCOL_VERSION,"models":[MODEL_ID] if model_ready() else [],"capabilities":["IMAGE_GENERATION"],"device":DEVICE,"precision":PRECISION,"concurrencyLimit":1,"capacity":capacity_profile()}

class Handler(BaseHTTPRequestHandler):
    def send_json(self,status:int,data:dict[str,Any])->None:
        raw=json.dumps(data).encode();self.send_response(status);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(raw)));self.end_headers();self.wfile.write(raw)
    def authorized(self)->bool:
        return bool(TOKEN) and hmac.compare_digest(self.headers.get("Authorization",""),f"Bearer {TOKEN}")
    def do_GET(self)->None:
        if not self.authorized():self.send_json(401,{"error":"AUTHENTICATION_FAILED"});return
        if self.path=="/health":self.send_json(200,health());return
        if self.path=="/capabilities":self.send_json(200,capabilities());return
        self.send_json(404,{"error":"NOT_FOUND"})
    def do_POST(self)->None:
        if not self.authorized():self.send_json(401,{"error":"AUTHENTICATION_FAILED"});return
        try:length=int(self.headers.get("Content-Length","0"))
        except ValueError:self.send_json(400,{"error":"INVALID_CONTENT_LENGTH"});return
        if length<=0 or length>MAX_BODY_BYTES:self.send_json(413,{"error":"REQUEST_TOO_LARGE"});return
        try:payload=json.loads(self.rfile.read(length))
        except Exception:self.send_json(400,{"error":"INVALID_JSON"});return
        if self.path in ("/reference","/generate"):
            status,result=generate(payload);self.send_json(status,result);return
        self.send_json(404,{"error":"NOT_FOUND"})
    def log_message(self,fmt:str,*args:Any)->None:print(json.dumps({"at":time.time(),"client":self.client_address[0],"message":fmt%args}))

if __name__=="__main__":ThreadingHTTPServer(("0.0.0.0",int(os.environ.get("PORT","8000"))),Handler).serve_forever()
