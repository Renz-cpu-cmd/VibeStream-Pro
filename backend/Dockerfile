# VibeStream Pro Backend
# Python 3.11 + ffmpeg + Deno (JS runtime for n-sig)
# Late-2025 High-Stability Guest Mode (TV + Android clients)
# Pro Audio Features: Bass Boost, Nightcore, AI Vocal Removal

FROM python:3.11-slim

# STEP 1: Install build tools FIRST (required for compiling Python wheels like diffq)
# Using separate apt-get update to ensure fresh package list
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        python3-dev && \
    rm -rf /var/lib/apt/lists/*

# STEP 2: Install system dependencies
# - ffmpeg: audio/video processing
# - curl: for installing Deno
# - unzip: for Deno installation
# - ca-certificates: for HTTPS requests
# - git: for yt-dlp nightly builds
# - libsndfile1: for audio-separator (sound file processing)
# NOTE: Node.js removed - no longer needed (token generator was too slow)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        unzip \
        ca-certificates \
        git \
        libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (JavaScript runtime for yt-dlp n-sig challenge solver)
# REQUIRED for late-2025: YouTube uses JS-based signature challenges
# that MUST be solved by an external runtime on datacenter IPs
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Verify Deno installation
RUN deno --version

# Set working directory
WORKDIR /app

# Environment variables for Render free tier (CPU only, no GPU)
# Prevents ONNX runtime from looking for GPU and crashing
ENV ONNX_RUNTIME_EXECUTION_PROVIDERS="CPUExecutionProvider"
ENV PYTHONUNBUFFERED=1

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies (includes curl-cffi for TLS impersonation)
RUN pip install --no-cache-dir -r requirements.txt

# Install yt-dlp STABLE with curl-cffi - force clean install to avoid cached buggy versions
RUN pip install --no-cache-dir -U "yt-dlp[default,curl-cffi]"

# Upgrade setuptools and wheel BEFORE audio-separator to handle wheel building better
# This helps avoid gcc dependency issues with packages like diffq
RUN pip install --no-cache-dir --upgrade setuptools wheel

# Install audio-separator for AI-based vocal removal (Minus One / Karaoke feature)
# Uses UVR (Ultimate Vocal Remover) models via ONNX runtime (CPU mode)
RUN pip install --no-cache-dir audio-separator[cpu]

# Verify installations
RUN yt-dlp --version
RUN audio-separator --help || echo "audio-separator installed"

# Copy application code (excluding cookies.txt for security)
COPY main.py .
COPY pyproject.toml .

# cookies.txt handling:
# Option 1: Copy from build context (not recommended for public repos)
# COPY cookies.txt .
#
# Option 2: Use Docker secrets (recommended for production)
# Mount as: docker run -v /path/to/cookies.txt:/run/secrets/cookies_txt:ro
#
# Option 3: Set via environment or Render secret file
# The app checks /run/secrets/cookies_txt first, then ./cookies.txt

# Expose port
EXPOSE 8000

# Start uvicorn server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--access-log"]
