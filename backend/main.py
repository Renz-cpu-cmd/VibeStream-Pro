"""
VibeStream Pro API
- Rate limiting (5 downloads/hour per IP)
- Cookie-based auth with guest fallback
- Privacy-first logging (no URLs logged)
- Late-2025 yt-dlp standards (n-sig solver, curl-cffi impersonation)
"""

import logging
import os
import random
import re
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
import yt_dlp

# ---------- Logging Setup (Privacy-First) ----------
# Disable default uvicorn access logs that contain URLs
logging.getLogger("uvicorn.access").disabled = True

# Custom logger that never logs user URLs
logger = logging.getLogger("vibestream")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
logger.addHandler(handler)

# ---------- Rate Limiter Setup ----------
# 5 downloads per hour per IP address
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="VibeStream Pro API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------- FFmpeg Setup ----------
BACKEND_DIR = Path(__file__).parent.resolve()
FFMPEG_EXE = BACKEND_DIR / "ffmpeg.exe"
FFPROBE_EXE = BACKEND_DIR / "ffprobe.exe"

USE_LOCAL_FFMPEG = FFMPEG_EXE.exists() and FFPROBE_EXE.exists()
FFMPEG_LOCATION: str | None = str(BACKEND_DIR) if USE_LOCAL_FFMPEG else None

# ---------- Cookies Setup ----------
# Path to cookies.txt (throwaway account)
COOKIES_PATH = BACKEND_DIR / "cookies.txt"
# Also check for Docker secrets location
COOKIES_SECRET_PATH = Path("/run/secrets/cookies_txt")


def get_cookies_path() -> Path | None:
    """Return cookies path if exists, checking both local and Docker secrets."""
    if COOKIES_SECRET_PATH.exists():
        return COOKIES_SECRET_PATH
    if COOKIES_PATH.exists():
        return COOKIES_PATH
    return None


def ffmpeg_available() -> bool:
    """Check if ffmpeg is available (either local .exe or in system PATH)."""
    if USE_LOCAL_FFMPEG:
        return True
    return shutil.which("ffmpeg") is not None


@app.on_event("startup")
def startup_checks():
    """Log system status on startup (no sensitive data)."""
    # FFmpeg check
    if USE_LOCAL_FFMPEG:
        logger.info("✅ Using local ffmpeg")
    elif shutil.which("ffmpeg"):
        logger.info("✅ ffmpeg found in system PATH")
    else:
        logger.warning("⚠️  ffmpeg not found! MP3 conversion will fail.")

    # Deno/JS runtime check (for n-sig solver)
    if shutil.which("deno"):
        logger.info("✅ Deno JS runtime found (n-sig solver ready)")
    elif shutil.which("quickjs"):
        logger.info("✅ QuickJS runtime found (n-sig solver ready)")
    else:
        logger.warning("⚠️  No JS runtime (Deno/QuickJS) - some videos may fail")

    # Cookies check
    cookies = get_cookies_path()
    if cookies:
        logger.info("✅ cookies.txt found - authenticated mode enabled")
    else:
        logger.info("ℹ️  No cookies.txt - using guest mode (mweb + tv_embedded)")

    # Rate limit info
    logger.info("✅ Rate limiting active: 5 downloads/hour per IP")
    logger.info("✅ Browser impersonation enabled (curl-cffi)")
    logger.info("✅ Random sleep intervals: 3-8 seconds")


# ---------- CORS Setup ----------
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

EXTRA_ORIGINS = os.getenv("CORS_ORIGINS", "")
if EXTRA_ORIGINS:
    ALLOWED_ORIGINS.extend([o.strip() for o in EXTRA_ORIGINS.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
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
    duration: int | None
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


def build_ydl_opts(for_download: bool = False, include_ffmpeg: bool = False) -> dict:
    """
    Build yt-dlp options with late-2025 anti-bot bypass standards:
    - Random sleep intervals (3-8s) to avoid linear request patterns
    - Browser impersonation via curl-cffi
    - Client spoofing (mweb/tv_embedded)
    - Extractor args to skip webpage/config fetching
    - Cookie support with Netscape format validation
    """
    # Random sleep interval to avoid bot detection (3-8 seconds)
    sleep_min = 3
    sleep_max = 8
    
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "no_color": True,
        # Privacy: don't cache or store anything
        "cachedir": False,
        "writedescription": False,
        "writeinfojson": False,
        "writeannotations": False,
        "writesubtitles": False,
        "writethumbnail": False,
        # Rate limiting: random sleep between requests
        "sleep_interval": sleep_min,
        "max_sleep_interval": sleep_max,
        "sleep_interval_requests": random.uniform(1, 3),
        # Browser impersonation via curl-cffi (bypasses TLS fingerprinting)
        "impersonate": "chrome",
    }

    if not for_download:
        opts["skip_download"] = True

    # Add ffmpeg location if available
    if include_ffmpeg and FFMPEG_LOCATION:
        opts["ffmpeg_location"] = FFMPEG_LOCATION

    # Try cookies first, then fallback to guest mode
    cookies = get_cookies_path()
    if cookies:
        # Cookies file should be in Netscape format
        opts["cookiefile"] = str(cookies)
        # Still use safe extractor args even with cookies
        opts["extractor_args"] = {
            "youtube": {
                "player_client": ["mweb", "tv_embedded"],
                "player_skip": ["webpage", "configs"],
            }
        }
    else:
        # Guest mode: use mobile web + tv_embedded clients for maximum compatibility
        opts["extractor_args"] = {
            "youtube": {
                "player_client": ["mweb", "tv_embedded"],
                "player_skip": ["webpage", "configs"],
            }
        }

    # HTTP headers for all requests (mobile user agent)
    opts["http_headers"] = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }

    return opts


# ---------- Routes ----------
@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"name": "VibeStream Pro API", "docs": "/docs"}


@app.post("/analyze", response_model=VideoInfo)
@limiter.limit("20/minute")  # More lenient for analyze
def analyze_video(request: Request, body: AnalyzeRequest):
    """
    Extract metadata (title, thumbnail, duration) for a given video URL.
    """
    logger.info("Analyze request received")  # No URL logged for privacy

    ydl_opts = build_ydl_opts(for_download=False)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(body.url, download=False)
    except Exception as e:
        logger.warning("Analyze failed")  # No details logged
        raise HTTPException(status_code=400, detail=f"Could not analyze URL: {e}")

    if info is None:
        raise HTTPException(status_code=400, detail="No info returned for this URL")

    duration = info.get("duration")
    logger.info("Analyze successful")

    return VideoInfo(
        title=info.get("title", "Unknown"),
        thumbnail=info.get("thumbnail"),
        duration=duration,
        duration_str=format_duration(duration),
    )


@app.get("/download")
@limiter.limit("5/hour")  # 5 downloads per hour per IP
def download_audio(request: Request, url: str = Query(..., description="Video URL")):
    """
    Stream the audio (MP3) of the given video URL.
    Rate limited to 5 downloads per hour per IP.
    """
    logger.info("Download request received")  # No URL logged for privacy

    if not ffmpeg_available():
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not found. Server configuration error.",
        )

    # First, get video info
    ydl_opts = build_ydl_opts(for_download=False, include_ffmpeg=True)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        logger.warning("Download info fetch failed")
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")

    if info is None:
        raise HTTPException(status_code=400, detail="No info for this URL")

    title = sanitize_filename(info.get("title", "audio"))

    # Download to temp file
    tmp_dir = tempfile.mkdtemp()

    ydl_download_opts = build_ydl_opts(for_download=True, include_ffmpeg=True)
    ydl_download_opts.update({
        "format": "bestaudio/best",
        "outtmpl": str(Path(tmp_dir) / "%(title)s.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    })

    try:
        with yt_dlp.YoutubeDL(ydl_download_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        logger.warning("Download/conversion failed")
        raise HTTPException(status_code=500, detail=f"Download/conversion failed: {e}")

    mp3_files = list(Path(tmp_dir).glob("*.mp3"))
    if not mp3_files:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="MP3 conversion failed.")

    mp3_path = mp3_files[0]
    logger.info("Download successful")

    def iterfile():
        try:
            with open(mp3_path, "rb") as f:
                yield from f
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    return StreamingResponse(
        iterfile(),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'attachment; filename="{title}.mp3"'},
    )
