# MetroForge OpenVINO production worker

Build from the repository root:

```bash
docker build -f workers/remote-visual/Dockerfile -t metroforge-openvino-worker .
```

Run behind TLS termination and mount the prepared OpenVINO SD1.5 model read-only:

```bash
docker run --rm -p 8000:8000 \
  -e METROFORGE_REMOTE_TOKEN \
  -e METROFORGE_OPENVINO_DEVICE=GPU \
  -e METROFORGE_GPU_VRAM_MB=8192 \
  -v /srv/models/sd-1.5:/models/openvino/sd-1.5:ro \
  metroforge-openvino-worker
```

Configure the MetroForge caller with `METROFORGE_PRODUCTION_REMOTE_URL`,
`METROFORGE_PRODUCTION_REMOTE_TOKEN`, `METROFORGE_PRODUCTION_REMOTE_MODEL=sd-1.5`, and an optional
worker ID/device. `/health` and `/capabilities` are authenticated, do not compile models, and
report admission data. Production concurrency is fixed at one. The service refuses to start
inference if request identity, model, exact 384x384/6-step PNDM parameters, device, model files, or
memory safety checks fail.
