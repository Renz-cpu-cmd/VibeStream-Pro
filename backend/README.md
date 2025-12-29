# VibeStream Pro (Backend)

FastAPI + yt-dlp + ffmpeg with rate limiting and privacy features.

## Features

- **Rate Limiting**: 5 downloads/hour per IP (configurable)
- **Cookie Support**: Optional throwaway account cookies for restricted content
- **Guest Mode Fallback**: Uses mobile web client if no cookies available
- **Privacy-First**: No user URLs logged

## Run Locally (Windows)

1. Place `ffmpeg.exe` and `ffprobe.exe` in this folder
2. Create virtual environment: `python -m venv .venv`
3. Activate: `.\.venv\Scripts\Activate.ps1`
4. Install deps: `pip install -r requirements.txt`
5. Run: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`

## Cookie Setup (Optional)

For accessing age-restricted or region-locked content:

1. Create a **throwaway YouTube account** (not your main account!)
2. Install browser extension "Get cookies.txt LOCALLY"
3. Export cookies while logged into YouTube
4. Save as `cookies.txt` in this folder
5. Restart the server

⚠️ **WARNING**: Never use your main Google account - it may get banned.

## Rate Limit Configuration

Default: 5 downloads per hour per IP address.

To change, edit the `@limiter.limit()` decorator in `main.py`:
- `"5/hour"` - 5 per hour (default)
- `"10/hour"` - 10 per hour
- `"1/minute"` - 1 per minute
- `"100/day"` - 100 per day

## Deploy to Render

1. Push this repo to GitHub
2. Create a new **Web Service** on Render
3. Select **Docker** as the environment
4. Set the **Root Directory** to `backend`
5. For cookies, use Render's Secret Files feature:
   - Add a secret file named `cookies.txt`
   - Mount it at `/app/cookies.txt`

The Dockerfile installs ffmpeg via apt-get automatically.