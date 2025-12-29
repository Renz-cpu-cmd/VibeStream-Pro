# VibeStream Pro (Backend)

FastAPI + yt-dlp + ffmpeg

## Run Locally (Windows)

1. Place `ffmpeg.exe` and `ffprobe.exe` in this folder
2. Create virtual environment: `python -m venv .venv`
3. Activate: `.\.venv\Scripts\Activate.ps1`
4. Install deps: `pip install -r requirements.txt`
5. Run: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`

## Deploy to Render

1. Push this repo to GitHub
2. Create a new **Web Service** on Render
3. Select **Docker** as the environment
4. Set the **Root Directory** to `backend`
5. Render will auto-detect the Dockerfile
6. Add env var `CORS_ORIGINS` with your Vercel frontend URL (optional)

The Dockerfile installs ffmpeg via apt-get, so no .exe files needed in production.