# VibeStream Pro Backend
# Python 3.11 + ffmpeg + Deno + Node.js (JS runtimes for yt-dlp)
# Late-2025 Self-Healing Anti-Bot Bypass Stack

FROM python:3.11-slim

# Install system dependencies:
# - ffmpeg: audio/video processing
# - curl: for installing Deno and Node.js
# - unzip: for Deno installation
# - ca-certificates: for HTTPS requests
# - git: for yt-dlp nightly builds
# - gnupg: for Node.js repo key
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        unzip \
        ca-certificates \
        git \
        gnupg && \
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

# CRITICAL: Install yt-dlp NIGHTLY for Dec 2025 YouTube bypasses
# The --pre flag pulls the latest nightly build with up-to-date extractor fixes
# This is REQUIRED to bypass the Dec 20th 2025 YouTube update affecting Render IPs
RUN pip install -U --pre "yt-dlp[default,curl-cffi]"

# Install youtube-po-token-generator for automatic PO Token generation
# This makes the backend 'self-healing' - no manual token extraction needed
RUN pip install youtube-po-token-generator

# Verify installations
RUN yt-dlp --version

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
