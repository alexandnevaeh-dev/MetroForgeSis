import base64
import hashlib
import importlib.util
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("metroforge_remote_worker", Path(__file__).with_name("server.py"))
worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(worker)


def payload():
    data = {"assetId":"player base","providerModel":"sd-1.5","prompt":"locked prompt","negativePrompt":"text","seed":920001,"width":384,"height":384,"conditioning":{"steps":6,"scheduler":"PNDM","guidance":7.5,"category":"player","visualBibleVersion":"modern-v2","visualBibleHash":"a"*64}}
    digest = worker.request_hash(data)
    data["requestId"] = digest; data["conditioning"]["requestHash"] = digest
    return data


class RemoteWorkerTests(unittest.TestCase):
    def supported(self):
        return {"status":"SUPPORTED","reasons":[],"totalRamMb":32768,"availableRamMb":20000,"deviceMemoryMb":8192,"openvino":{"version":"test","devices":["GPU"]}}

    def test_request_hash_recomputed_and_mismatch_rejected(self):
        data = payload(); self.assertEqual(data["requestId"], worker.request_hash(data))
        data["prompt"] = "tampered"
        with patch.object(worker, "capacity_profile", return_value=self.supported()):
            self.assertEqual(worker.admission(data)[1], "REQUEST_HASH_MISMATCH")

    def test_unsupported_model_and_insufficient_capacity(self):
        data = payload(); data["providerModel"] = "other"; digest = worker.request_hash(data); data["requestId"] = digest; data["conditioning"]["requestHash"] = digest
        with patch.object(worker, "capacity_profile", return_value=self.supported()): self.assertEqual(worker.admission(data)[1], "UNSUPPORTED_MODEL")
        data = payload()
        with patch.object(worker, "capacity_profile", return_value={**self.supported(), "status":"UNSUPPORTED_LOCAL_CAPACITY"}): self.assertEqual(worker.admission(data)[1], "REMOTE_CAPACITY_INSUFFICIENT")

    def test_busy_is_explicit(self):
        worker._generation_lock.acquire()
        try:
            with patch.object(worker, "admission", return_value=(True,None,self.supported())):
                status, result = worker.generate(payload())
            self.assertEqual(status, 429); self.assertEqual(result["errors"], ["BUSY"])
        finally: worker._generation_lock.release()

    def test_success_contract_and_artifact_hash(self):
        image = b"\x89PNG\r\n\x1a\nproduction-bytes"
        runtime = {"ok":True,"image_base64":base64.b64encode(image).decode(),"timings":{"unetInferenceMs":12},"runtime":{"actualDevice":"GPU"},"memory":{"systemAvailableRamMb":20000}}
        with patch.object(worker,"admission",return_value=(True,None,self.supported())), patch.object(worker,"runtime_request",return_value=runtime):
            status, result = worker.generate(payload())
        self.assertEqual(status,200); self.assertEqual(result["requestId"],payload()["requestId"])
        self.assertEqual(result["artifact"]["sha256"],hashlib.sha256(image).hexdigest().upper())
        self.assertEqual(result["provenance"]["effectiveParameters"]["steps"],6)

    def test_authentication_failure(self):
        old_token=worker.TOKEN; worker.TOKEN="secret"
        server=ThreadingHTTPServer(("127.0.0.1",0),worker.Handler); thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with self.assertRaises(urllib.error.HTTPError) as caught: urllib.request.urlopen(f"http://127.0.0.1:{server.server_port}/health")
            self.assertEqual(caught.exception.code,401)
        finally: server.shutdown();server.server_close();worker.TOKEN=old_token


if __name__ == "__main__": unittest.main()
