import os
import re
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import yt_dlp

app = FastAPI(title="VibeStream Pro API")

# ---------- FFmpeg Setup ----------
# Check for local .exe files (Windows dev) or system PATH (Linux/Docker prod)
BACKEND_DIR = Path(__file__).parent.resolve()
FFMPEG_EXE = BACKEND_DIR / "ffmpeg.exe"
FFPROBE_EXE = BACKEND_DIR / "ffprobe.exe"

# Determine ffmpeg location: use local folder if .exe exists, otherwise rely on system PATH
USE_LOCAL_FFMPEG = FFMPEG_EXE.exists() and FFPROBE_EXE.exists()
FFMPEG_LOCATION: str | None = str(BACKEND_DIR) if USE_LOCAL_FFMPEG else None


def ffmpeg_available() -> bool:
    """Check if ffmpeg is available (either local .exe or in system PATH)."""
    if USE_LOCAL_FFMPEG:
        return True
    # Check system PATH
    return shutil.which("ffmpeg") is not None


@app.on_event("startup")
def check_ffmpeg():
    """Log ffmpeg availability on startup."""
    if USE_LOCAL_FFMPEG:
        print(f"✅ Using local ffmpeg at {BACKEND_DIR}")
    elif shutil.which("ffmpeg"):
        print(f"✅ ffmpeg found in system PATH: {shutil.which('ffmpeg')}")
    else:
        print("⚠️  WARNING: ffmpeg not found! MP3 conversion will fail.")
        print("   - On Windows: place ffmpeg.exe in the backend/ folder")
        print("   - On Linux/Docker: install ffmpeg via apt-get")


# CORS: allow frontend origins (local dev + any Vercel deployment)
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Add custom origins from environment variable (comma-separated)
EXTRA_ORIGINS = os.getenv("CORS_ORIGINS", "")
if EXTRA_ORIGINS:
    ALLOWED_ORIGINS.extend([o.strip() for o in EXTRA_ORIGINS.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Allow any *.vercel.app subdomain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Schemas ----------
class AnalyzeRequest(BaseModel):
    url: str


class VideoInfo(BaseModel):
    title: str
    thumbnail: str | None
    duration: int | None  # seconds
    duration_str: str


# ---------- Helpers ----------
def format_duration(seconds: int | None) -> str:
    if seconds is None:
        return "Unknown"
    mins, secs = divmod(seconds, 60)
    hrs, mins = divmod(mins, 60)
    if hrs:
        return f"{hrs}:{mins:02}:{secs:02}"
    return f"{mins}:{secs:02}"


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()[:100]


# ---------- Routes ----------
@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"name": "VibeStream Pro API", "docs": "/docs"}


@app.post("/analyze", response_model=VideoInfo)
def analyze_video(body: AnalyzeRequest):
    """
    Extract metadata (title, thumbnail, duration) for a given video URL.
    """
    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(body.url, download=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not analyze URL: {e}")

    if info is None:
        raise HTTPException(status_code=400, detail="No info returned for this URL")

    duration = info.get("duration")
    return VideoInfo(
        title=info.get("title", "Unknown"),
        thumbnail=info.get("thumbnail"),
        duration=duration,
        duration_str=format_duration(duration),
    )


@app.get("/download")
def download_audio(url: str = Query(..., description="Video URL")):
    """
    Stream the audio (MP3) of the given video URL.
    Uses yt-dlp + ffmpeg to extract audio in a memory-efficient way.
    """
    # Check ffmpeg is available before attempting download
    if not ffmpeg_available():
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not found. Please install ffmpeg or add ffmpeg.exe to the backend folder.",
        )

    # Build yt-dlp options (include ffmpeg_location only if using local .exe)
    ydl_opts: dict = {
        "quiet": True,
        "skip_download": True,
        "no_warnings": True,
    }
    if FFMPEG_LOCATION:
        ydl_opts["ffmpeg_location"] = FFMPEG_LOCATION

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")

    if info is None:
        raise HTTPException(status_code=400, detail="No info for this URL")

    title = sanitize_filename(info.get("title", "audio"))

    # Download to temp file then stream
    tmp_dir = tempfile.mkdtemp()

    ydl_download_opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio/best",
        "outtmpl": str(Path(tmp_dir) / "%(title)s.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }
    if FFMPEG_LOCATION:
        ydl_download_opts["ffmpeg_location"] = FFMPEG_LOCATION

    try:
        with yt_dlp.YoutubeDL(ydl_download_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        # Cleanup temp dir on failure
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Download/conversion failed: {e}")

    # Find the mp3 file (yt-dlp may sanitize filename differently)
    mp3_files = list(Path(tmp_dir).glob("*.mp3"))
    if not mp3_files:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail="MP3 conversion failed. Make sure ffmpeg.exe and ffprobe.exe are in the backend folder.",
        )

    mp3_path = mp3_files[0]

    def iterfile():
        try:
            with open(mp3_path, "rb") as f:
                yield from f
        finally:
            # cleanup entire temp directory
            shutil.rmtree(tmp_dir, ignore_errors=True)

    return StreamingResponse(
        iterfile(),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'attachment; filename="{title}.mp3"'},
    )
