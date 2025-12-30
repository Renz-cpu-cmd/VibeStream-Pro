# VibeStream Pro Backend
# Python 3.11 + ffmpeg + Deno (JS runtime for n-sig)
# Late-2025 TV Client Bypass (TV + iOS clients)
# Pro Audio Features: Bass Boost, Nightcore, Vocal Removal (FFmpeg)

FROM python:3.11-slim

# Install system dependencies only (no build tools needed - using pre-built wheels)
# - ffmpeg: audio/video processing (also handles vocal removal via center channel)
# - curl + unzip: for Deno installation  
# - ca-certificates: for HTTPS
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        unzip \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (required for yt-dlp n-sig challenge solver)
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Verify Deno
RUN deno --version

WORKDIR /app

ENV PYTHONUNBUFFERED=1

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install yt-dlp with curl-cffi for TLS impersonation
RUN pip install --no-cache-dir -U "yt-dlp[default,curl-cffi]"

# Verify
RUN yt-dlp --version

# Copy application code
COPY main.py .
COPY pyproject.toml .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
