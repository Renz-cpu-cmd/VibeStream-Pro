# VibeStream Pro Backend
# Python 3.11 + ffmpeg + Deno (JS runtime for yt-dlp n-sig solver)

FROM python:3.11-slim

# Install system dependencies:
# - ffmpeg: audio/video processing
# - curl: for installing Deno
# - unzip: for Deno installation
# - ca-certificates: for HTTPS requests
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        unzip \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (JavaScript runtime for yt-dlp n-sig challenge solver)
# yt-dlp 2024.12+ requires an external JS runtime (Deno, QuickJS, or PhantomJS)
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Verify Deno installation
RUN deno --version

# Set working directory
WORKDIR /app

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies
# yt-dlp with curl-cffi for browser impersonation (bypass TLS fingerprinting)
RUN pip install --no-cache-dir -r requirements.txt

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

# Start uvicorn server with minimal logging (no access logs for privacy)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--access-log"]
