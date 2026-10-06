FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000 METROFORGE_OPENVINO_CACHE_DIR=/tmp/metroforge-openvino-cache
WORKDIR /app
COPY workers/remote-visual/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY workers/remote-visual/server.py ./
COPY workers/openvino_direct_server.py ./
EXPOSE 8000
USER 65532:65532
CMD ["python", "server.py"]
