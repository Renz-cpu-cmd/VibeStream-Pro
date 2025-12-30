# VibeStream Pro Backend
# Python 3.11 + ffmpeg + Deno (JS runtime for n-sig)
# Late-2025 Pure Guest Mode (TV + Android clients)
# Pro Audio Features: Bass Boost, Nightcore, AI Vocal Removal

FROM python:3.11-slim

# Install system dependencies (minimal)
# - ffmpeg: audio/video processing
# - curl + unzip: for Deno installation  
# - ca-certificates: for HTTPS
# - libsndfile1: for audio-separator
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        unzip \
        ca-certificates \
        libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (required for yt-dlp n-sig challenge solver)
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Verify Deno
RUN deno --version

WORKDIR /app

# Environment for Render free tier (CPU only)
ENV ONNX_RUNTIME_EXECUTION_PROVIDERS="CPUExecutionProvider"
ENV PYTHONUNBUFFERED=1

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install yt-dlp with curl-cffi for TLS impersonation
RUN pip install --no-cache-dir -U "yt-dlp[default,curl-cffi]"

# Install audio-separator for AI vocal removal (uses pre-built wheels)
RUN pip install --no-cache-dir audio-separator[cpu]

# Verify
RUN yt-dlp --version

# Copy application code
COPY main.py .
COPY pyproject.toml .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
