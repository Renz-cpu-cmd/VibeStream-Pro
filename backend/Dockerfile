# VibeStream Pro Backend
# Python 3.11 + ffmpeg + Deno + Node.js (JS runtimes for yt-dlp)
# Late-2025 Self-Healing Anti-Bot Bypass Stack
# Pro Audio Features: Bass Boost, Nightcore, AI Vocal Removal

FROM python:3.11-slim

# Install system dependencies:
# - ffmpeg: audio/video processing
# - curl: for installing Deno and Node.js
# - unzip: for Deno installation
# - ca-certificates: for HTTPS requests
# - git: for yt-dlp nightly builds
# - gnupg: for Node.js repo key
# - libsndfile1: for audio-separator (sound file processing)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        unzip \
        ca-certificates \
        git \
        gnupg \
        libsndfile1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS (required for youtube-po-token-generator)
# This enables automatic PO Token generation without manual F12 extraction
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify Node.js installation
RUN node --version && npm --version

# Install Deno (JavaScript runtime for yt-dlp n-sig challenge solver)
# REQUIRED for late-2025: YouTube uses JS-based signature challenges
# that MUST be solved by an external runtime on datacenter IPs
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Verify Deno installation
RUN deno --version

# Set working directory
WORKDIR /app

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies (includes curl-cffi for TLS impersonation)
RUN pip install --no-cache-dir -r requirements.txt

# Install yt-dlp STABLE with curl-cffi - force clean install to avoid cached buggy versions
# --no-cache-dir ensures we get fresh packages every build
RUN pip install --no-cache-dir -U "yt-dlp[default,curl-cffi]"

# Install audio-separator for AI-based vocal removal (Minus One / Karaoke feature)
# Uses UVR (Ultimate Vocal Remover) models via ONNX runtime
RUN pip install --no-cache-dir audio-separator[cpu]

# Install youtube-po-token-generator via NPM (NOT pip - it's an NPM package)
# This makes the backend 'self-healing' - no manual token extraction needed
RUN npm install -g youtube-po-token-generator

# Verify installations
RUN yt-dlp --version
RUN audio-separator --help || echo "audio-separator installed"
RUN youtube-po-token-generator --help || echo "youtube-po-token-generator installed"

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

# Disable Python buffering for real-time logs
ENV PYTHONUNBUFFERED=1

# Start uvicorn server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--access-log"]
