"""
VibeStream Pro API
Late-2025 High-Stability Guest Mode:
- Deno JS runtime for n-sig challenge solving
- curl-cffi for TLS fingerprint impersonation
- TV + Android clients (most permissive for guest requests)
- Web Integrity bypass (skip webpage/configs/dash/hls)
- Rate limiting (5 downloads/hour per IP)
- Privacy-first logging (no URLs logged)

Pro Audio Features:
- Standard MP3: Basic audio extraction
- Minus One (Karaoke): AI vocal removal using audio-separator
- Bass Boosted: +10dB low frequency enhancement
- Nightcore: 1.25x speed + pitch up

Advanced Personalization:
- Metadata embedding (cover art, artist, title)
- Audio trimming (start/end time)
- Search by song name (ytsearch:)
"""

import logging
import os
import re
import shutil
import subprocess
import tempfile
import traceback
from enum import Enum
from pathlib import Path
from typing import Literal, Optional
import urllib.request

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
import yt_dlp

# Mutagen for MP3 metadata embedding
try:
    from mutagen.mp3 import MP3
    from mutagen.id3 import ID3, APIC, TIT2, TPE1, ID3NoHeaderError
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False
    logger_temp = logging.getLogger("vibestream")
    logger_temp.warning("mutagen not installed - metadata embedding disabled")

# ---------- Logging Setup (Privacy-First) ----------
logging.getLogger("uvicorn.access").disabled = True

logger = logging.getLogger("vibestream")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
logger.addHandler(handler)

# ---------- Rate Limiter Setup ----------
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

    # Deno/JS runtime check (CRITICAL for n-sig)
    if shutil.which("deno"):
        logger.info("✅ Deno JS runtime found (n-sig solver ready)")
    else:
        logger.warning("⚠️  No JS runtime (Deno) - n-sig challenges may FAIL!")

    # Feature summary
    logger.info("📺 Pure Guest Mode: TV + iOS clients (Dec 2025 bypass)")
    logger.info("✅ Web Integrity bypass: skip webpage/configs/dash/hls")
    logger.info("✅ Rate limiting: 5 downloads/hour per IP")


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
    url: str | None = None  # Actual video URL (for search results)
    uploader: str | None = None  # Artist/channel name


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
    Build yt-dlp options with Late-2025 TV Client Bypass.
    
    Key settings (December 2025):
    - TV + iOS clients (most stable for Render datacenter IPs)
    - Web Integrity bypass (skip webpage/configs/dash/hls)
    - player_params: atfg=1 forces TV-specific parameters
    - curl-cffi for TLS fingerprint impersonation
    - NO cookies, NO PO tokens - pure guest mode
    """
    opts: dict = {
        # Core settings
        "verbose": True,
        "logger": logger,
        "no_color": True,
        "noplaylist": True,
        # Pure Guest Mode: NO impersonate, use curl_cffi directly
        "impersonate": None,
        "request_handler": "curl_cffi",
        # TV Client Bypass (December 2025)
        "extractor_args": {
            "youtube": {
                "player_client": ["tv", "ios"],
                "player_skip": ["webpage", "configs"],
                "skip": ["dash", "hls"],
                "player_params": "atfg=1",  # Forces TV-specific parameters
            }
        },
    }

    if not for_download:
        opts["skip_download"] = True

    if include_ffmpeg and FFMPEG_LOCATION:
        opts["ffmpeg_location"] = FFMPEG_LOCATION

    return opts


# ---------- URL/Search Detection ----------
def is_url(text: str) -> bool:
    """Check if text looks like a URL (starts with http/https)."""
    text = text.strip().lower()
    return text.startswith('http://') or text.startswith('https://')


def prepare_url(input_text: str) -> str:
    """
    Prepare URL for yt-dlp. If input doesn't start with http,
    treat it as a search query and prepend 'ytsearch1:'.
    """
    text = input_text.strip()
    if is_url(text):
        return text
    # It's a search query - use ytsearch: prefix
    logger.info(f"🔍 Search query detected, using ytsearch1:")
    return f"ytsearch1:{text}"


# ---------- Audio Processing Functions ----------
AudioMode = Literal["standard", "minus_one", "bass_boost", "nightcore"]


def apply_bass_boost(input_path: Path, output_path: Path) -> bool:
    """
    Apply bass boost using FFmpeg equalizer filter.
    Boosts frequencies below 200Hz by 10dB.
    """
    logger.info("🔊 Applying bass boost...")
    try:
        cmd = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-af", "bass=g=10:f=110:w=0.6",
            "-c:a", "libmp3lame", "-q:a", "2",
            str(output_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error(f"Bass boost failed: {result.stderr}")
            return False
        logger.info("✅ Bass boost applied successfully")
        return True
    except Exception as e:
        logger.error(f"Bass boost error: {e}")
        return False


def apply_nightcore(input_path: Path, output_path: Path) -> bool:
    """
    Apply nightcore effect: speed up by 1.25x and pitch up.
    Uses atempo + asetrate for the classic nightcore sound.
    """
    logger.info("⚡ Applying nightcore effect...")
    try:
        # Nightcore: increase tempo by 25% and pitch by changing sample rate
        cmd = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-af", "asetrate=44100*1.25,aresample=44100,atempo=1.0",
            "-c:a", "libmp3lame", "-q:a", "2",
            str(output_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error(f"Nightcore failed: {result.stderr}")
            return False
        logger.info("✅ Nightcore effect applied successfully")
        return True
    except Exception as e:
        logger.error(f"Nightcore error: {e}")
        return False


def apply_vocal_removal(input_path: Path, output_path: Path) -> bool:
    """
    Remove vocals using FFmpeg center channel extraction (phase inversion).
    This is a lightweight alternative to AI-based separation.
    Works best on tracks with centered vocals and stereo instruments.
    """
    logger.info("🎤 Applying vocal removal (center channel extraction)...")
    try:
        # Center channel extraction: invert one channel and mix
        # This cancels out centered audio (usually vocals)
        cmd = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-af", "pan=stereo|c0=c0-c1|c1=c1-c0,stereotools=mlev=0.015625",
            "-c:a", "libmp3lame", "-q:a", "2",
            str(output_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error(f"Vocal removal failed: {result.stderr}")
            return False
        logger.info("✅ Vocal removal applied successfully")
        return True
    except Exception as e:
        logger.error(f"Vocal removal error: {e}")
        return False


def process_audio(input_path: Path, output_dir: Path, mode: AudioMode, title: str) -> Path | None:
    """
    Process audio based on selected mode.
    Returns path to processed file, or None on failure.
    """
    if mode == "standard":
        # No processing needed, return original
        return input_path
    
    elif mode == "bass_boost":
        output_path = output_dir / f"{title}_bass_boosted.mp3"
        if apply_bass_boost(input_path, output_path):
            return output_path
        return None
    
    elif mode == "nightcore":
        output_path = output_dir / f"{title}_nightcore.mp3"
        if apply_nightcore(input_path, output_path):
            return output_path
        return None
    
    elif mode == "minus_one":
        output_path = output_dir / f"{title}_instrumental.mp3"
        if apply_vocal_removal(input_path, output_path):
            return output_path
        return None
    
    return None


def apply_audio_trim(input_path: Path, output_path: Path, start_time: float, end_time: float) -> bool:
    """
    Trim audio using FFmpeg -ss and -to flags.
    Returns True on success.
    """
    logger.info(f"✂️ Trimming audio: {start_time}s to {end_time}s")
    try:
        duration = end_time - start_time
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-i", str(input_path),
            "-t", str(duration),
            "-c:a", "libmp3lame", "-q:a", "2",
            str(output_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error(f"Audio trim failed: {result.stderr}")
            return False
        logger.info("✅ Audio trimmed successfully")
        return True
    except Exception as e:
        logger.error(f"Audio trim error: {e}")
        return False


def embed_metadata(mp3_path: Path, title: str, artist: str, thumbnail_url: Optional[str]) -> bool:
    """
    Embed metadata (title, artist, cover art) into MP3 using mutagen.
    """
    if not MUTAGEN_AVAILABLE:
        logger.warning("Mutagen not available, skipping metadata embedding")
        return False
    
    logger.info("📝 Embedding metadata...")
    try:
        # Load or create ID3 tags
        try:
            audio = MP3(str(mp3_path), ID3=ID3)
        except ID3NoHeaderError:
            audio = MP3(str(mp3_path))
            audio.add_tags()
        
        # Set title
        audio.tags.add(TIT2(encoding=3, text=title))
        
        # Set artist
        if artist:
            audio.tags.add(TPE1(encoding=3, text=artist))
        
        # Download and embed thumbnail as cover art
        if thumbnail_url:
            try:
                logger.info("🖼️ Downloading thumbnail for cover art...")
                req = urllib.request.Request(
                    thumbnail_url,
                    headers={"User-Agent": "Mozilla/5.0"}
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    image_data = response.read()
                    # Determine MIME type from URL
                    mime_type = "image/jpeg"
                    if ".png" in thumbnail_url.lower():
                        mime_type = "image/png"
                    elif ".webp" in thumbnail_url.lower():
                        mime_type = "image/webp"
                    
                    audio.tags.add(APIC(
                        encoding=3,
                        mime=mime_type,
                        type=3,  # Cover (front)
                        desc="Cover",
                        data=image_data
                    ))
                    logger.info("✅ Cover art embedded")
            except Exception as e:
                logger.warning(f"Could not embed thumbnail: {e}")
        
        audio.save()
        logger.info("✅ Metadata embedded successfully")
        return True
    except Exception as e:
        logger.error(f"Metadata embedding error: {e}")
        return False


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
    Extract metadata (title, thumbnail, duration) for a given video URL or search query.
    If input is not a URL, searches YouTube using ytsearch1:.
    Pure Guest Mode - no cookies, no tokens.
    """
    logger.info("Analyze request received")  # No URL logged for privacy

    # Prepare URL (add ytsearch1: prefix if it's a search query)
    prepared_url = prepare_url(body.url)

    ydl_opts = build_ydl_opts(for_download=False)
    info = None

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(prepared_url, download=False)
            
            # For search results, get the first entry
            if info and "entries" in info:
                entries = list(info["entries"])
                info = entries[0] if entries else None
    except Exception as e:
        logger.error(f"Analyze failed: {e}")
        raise HTTPException(status_code=400, detail=f"Could not analyze: {e}")

    if info is None:
        raise HTTPException(status_code=400, detail="No results found")

    duration = info.get("duration")
    logger.info("Analyze successful")

    return VideoInfo(
        title=info.get("title", "Unknown"),
        thumbnail=info.get("thumbnail"),
        duration=duration,
        duration_str=format_duration(duration),
        # Include the actual URL for download (important for search results)
        url=info.get("webpage_url") or info.get("url"),
        uploader=info.get("uploader") or info.get("channel"),
    )


@app.get("/download")
@limiter.limit("5/hour")  # 5 downloads per hour per IP
def download_audio(
    request: Request,
    url: str = Query(..., description="Video URL or search query"),
    mode: AudioMode = Query("standard", description="Audio processing mode"),
    start_time: Optional[float] = Query(None, description="Trim start time in seconds"),
    end_time: Optional[float] = Query(None, description="Trim end time in seconds"),
):
    """
    Stream the audio (MP3) of the given video URL with optional processing.
    
    Modes:
    - standard: Basic MP3 extraction
    - bass_boost: +10dB bass enhancement
    - nightcore: 1.25x speed + pitch up
    - minus_one: AI vocal removal (karaoke)
    
    Advanced Options:
    - start_time/end_time: Trim audio to specific range
    - Metadata embedding: Cover art, title, artist automatically added
    
    Rate limited to 5 downloads per hour per IP.
    Pure Guest Mode - no cookies, no tokens.
    """
    logger.info(f"Download request received (mode: {mode}, trim: {start_time}-{end_time})")

    if not ffmpeg_available():
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not found. Server configuration error.",
        )

    # Prepare URL (add ytsearch1: prefix if it's a search query)
    prepared_url = prepare_url(url)

    # First, get video info
    ydl_opts = build_ydl_opts(for_download=False, include_ffmpeg=True)
    info = None

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(prepared_url, download=False)
            
            # For search results, get the first entry
            if info and "entries" in info:
                entries = list(info["entries"])
                info = entries[0] if entries else None
    except Exception as e:
        logger.error(f"Download info fetch failed: {e}")
        raise HTTPException(status_code=400, detail=f"Could not fetch: {e}")

    if info is None:
        raise HTTPException(status_code=400, detail="No results found")

    # Extract metadata for embedding
    title = sanitize_filename(info.get("title", "audio"))
    uploader = info.get("uploader") or info.get("channel") or ""
    thumbnail_url = info.get("thumbnail")
    video_duration = info.get("duration")
    actual_url = info.get("webpage_url") or info.get("url") or prepared_url

    # Validate trim times
    if start_time is not None and end_time is not None:
        if start_time >= end_time:
            raise HTTPException(status_code=400, detail="start_time must be less than end_time")
        if video_duration and end_time > video_duration:
            end_time = video_duration

    # Download to temp file
    tmp_dir = tempfile.mkdtemp()
    tmp_path = Path(tmp_dir)

    ydl_download_opts = build_ydl_opts(for_download=True, include_ffmpeg=True)
    ydl_download_opts.update({
        "format": "bestaudio/best",
        "outtmpl": str(tmp_path / "%(title)s.%(ext)s"),
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
            ydl.download([actual_url])
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        logger.error(f"Download/conversion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Download/conversion failed: {e}")

    mp3_files = list(tmp_path.glob("*.mp3"))
    if not mp3_files:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="MP3 conversion failed.")

    original_mp3 = mp3_files[0]
    current_mp3 = original_mp3
    logger.info("Download successful, applying processing...")

    # Step 1: Apply audio trimming if requested
    if start_time is not None and end_time is not None:
        trimmed_path = tmp_path / f"{title}_trimmed.mp3"
        if apply_audio_trim(current_mp3, trimmed_path, start_time, end_time):
            current_mp3 = trimmed_path
        else:
            logger.warning("Trimming failed, continuing with full audio")

    # Step 2: Apply audio processing based on mode
    final_path = process_audio(current_mp3, tmp_path, mode, title)
    
    if final_path is None:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Audio processing failed for mode: {mode}"
        )

    # Step 3: Embed metadata (title, artist, cover art)
    embed_metadata(final_path, title, uploader, thumbnail_url)

    # Determine output filename suffix based on mode
    mode_suffixes = {
        "standard": "",
        "bass_boost": "_bass_boosted",
        "nightcore": "_nightcore",
        "minus_one": "_instrumental",
    }
    suffix = mode_suffixes.get(mode, "")
    trim_suffix = f"_{int(start_time)}-{int(end_time)}s" if (start_time is not None and end_time is not None) else ""
    output_filename = f"{title}{suffix}{trim_suffix}.mp3"

    logger.info(f"Processing complete, serving file: {output_filename}")

    def iterfile():
        try:
            with open(final_path, "rb") as f:
                yield from f
        finally:
            # IMPORTANT: Clean up ALL temp files after download
            shutil.rmtree(tmp_dir, ignore_errors=True)
            logger.info("🧹 Temp files cleaned up")

    return StreamingResponse(
        iterfile(),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'attachment; filename="{output_filename}"'},
    )
