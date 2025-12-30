"""
VibeStream Pro API
Late-2025 Anti-Bot Bypass Stack:
- Deno JS runtime for n-sig challenge solving
- curl-cffi for TLS fingerprint impersonation
- PO Token (Proof of Origin) support
- Client rotation (tv, mweb, ios, android)
- Random User-Agent rotation
- Rate limiting (5 downloads/hour per IP)
- Privacy-first logging (no URLs logged)

Pro Audio Features:
- Standard MP3: Basic audio extraction
- Minus One (Karaoke): AI vocal removal using audio-separator
- Bass Boosted: +10dB low frequency enhancement
- Nightcore: 1.25x speed + pitch up
"""

import logging
import os
import random
import re
import shutil
import subprocess
import tempfile
import traceback
from enum import Enum
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
import yt_dlp

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

# ---------- Cookies Setup ----------
COOKIES_PATH = BACKEND_DIR / "cookies.txt"
COOKIES_SECRET_PATH = Path("/run/secrets/cookies_txt")
COOKIES_RENDER_PATH = Path("/etc/secrets/cookies.txt")  # Render's secret file path

# ---------- PO Token Setup (Proof of Origin) ----------
# Priority: Manual env var > Auto-generated via CLI
# Manual: Set YOUTUBE_PO_TOKEN in Render environment variables
# Auto: Uses youtube-po-token-generator CLI (NPM package) if manual not provided

MANUAL_PO_TOKEN = os.getenv("YOUTUBE_PO_TOKEN", "")
MANUAL_VISITOR_DATA = os.getenv("YOUTUBE_VISITOR_DATA", "")

# Global cache for auto-generated tokens (refreshed on failure)
_auto_token_cache: dict = {"po_token": None, "visitor_data": None, "generated_at": None}


def get_auto_po_token() -> tuple[str | None, str | None]:
    """
    Auto-generate PO Token by running youtube-po-token-generator CLI.
    This is an NPM package that outputs JSON with poToken and visitorData.
    Returns (po_token, visitor_data) or (None, None) on failure.
    """
    global _auto_token_cache
    import subprocess
    import json
    from datetime import datetime
    
    try:
        logger.info("🔄 Generating Auto Token via youtube-po-token-generator CLI...")
        
        # Run the NPM CLI tool and capture JSON output
        result = subprocess.run(
            ["youtube-po-token-generator"],
            capture_output=True,
            text=True,
            timeout=120  # 120 second timeout (Render free tier can be slow)
        )
        
        if result.returncode != 0:
            logger.error(f"❌ youtube-po-token-generator failed: {result.stderr}")
            return None, None
        
        # Parse JSON output
        output = result.stdout.strip()
        
        # Handle case where output might have extra text before JSON
        # Find the first '{' to start of JSON
        json_start = output.find('{')
        if json_start == -1:
            logger.error(f"❌ No JSON found in output: {output[:200]}")
            return None, None
        
        json_str = output[json_start:]
        token_data = json.loads(json_str)
        
        # Extract tokens (handle different key formats)
        po_token = token_data.get("poToken") or token_data.get("po_token")
        visitor_data = token_data.get("visitorData") or token_data.get("visitor_data")
        
        if po_token:
            _auto_token_cache["po_token"] = po_token
            _auto_token_cache["visitor_data"] = visitor_data
            _auto_token_cache["generated_at"] = datetime.now().isoformat()
            logger.info("✅ Auto Token generated successfully")
            return po_token, visitor_data
        else:
            logger.warning(f"⚠️ Auto Token generation returned empty token. Output: {output[:200]}")
            return None, None
            
    except FileNotFoundError:
        logger.warning("⚠️ youtube-po-token-generator CLI not found (npm package not installed)")
        return None, None
    except subprocess.TimeoutExpired:
        logger.error("❌ Auto Token generation timed out after 120 seconds")
        return None, None
    except json.JSONDecodeError as e:
        logger.error(f"❌ Failed to parse JSON from youtube-po-token-generator: {e}")
        return None, None
    except Exception as e:
        logger.error(f"❌ Auto Token generation failed: {e}")
        return None, None


def get_po_token() -> tuple[str | None, str | None, str]:
    """
    Get PO Token with priority: Manual > Cached Auto > Fresh Auto > None (guest fallback).
    Returns (po_token, visitor_data, source_label).
    """
    # Priority 1: Manual token from environment variable
    if MANUAL_PO_TOKEN:
        logger.info("🔑 Using Manual Token from YOUTUBE_PO_TOKEN env var")
        return MANUAL_PO_TOKEN, MANUAL_VISITOR_DATA, "manual"
    
    # Priority 2: Cached auto-generated token
    if _auto_token_cache["po_token"]:
        logger.info("🔑 Using Cached Auto Token")
        return _auto_token_cache["po_token"], _auto_token_cache["visitor_data"], "auto_cached"
    
    # Priority 3: Generate fresh auto token
    po_token, visitor_data = get_auto_po_token()
    if po_token:
        return po_token, visitor_data, "auto_fresh"
    
    # No token available - will fallback to mweb guest mode
    logger.warning("⚠️ No PO Token available - falling back to mweb guest mode")
    return None, None, "none"


def invalidate_auto_token():
    """Clear cached auto token to force regeneration on next request."""
    global _auto_token_cache
    _auto_token_cache = {"po_token": None, "visitor_data": None, "generated_at": None}
    logger.info("🔄 Auto Token cache invalidated - will regenerate on next request")


# ---------- User-Agent Rotation Pool ----------
# Real Chrome/Android user agents to rotate through
USER_AGENTS = [
    # Chrome on Android (various devices)
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.193 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36",
    # Chrome on iOS (for ios client)
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.6167.66 Mobile/15E148 Safari/604.1",
    # Chrome Desktop (for tv client)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

# Client impersonation targets for curl-cffi
IMPERSONATE_TARGETS = [
    "chrome",
    "chrome110",
    "chrome120",
    "edge",
    "safari",
]


def get_random_user_agent() -> str:
    """Return a random User-Agent from the pool."""
    return random.choice(USER_AGENTS)


def get_random_impersonate() -> str:
    """Return a random impersonation target for curl-cffi."""
    return random.choice(IMPERSONATE_TARGETS)


def get_cookies_path() -> Path | None:
    """Return cookies path if exists, checking Render secrets, Docker secrets, then local."""
    # Priority 1: Render secret file path
    if COOKIES_RENDER_PATH.exists():
        logger.info("🍪 Using cookies from /etc/secrets/cookies.txt (Render)")
        return COOKIES_RENDER_PATH
    # Priority 2: Docker secrets path
    if COOKIES_SECRET_PATH.exists():
        logger.info("🍪 Using cookies from /run/secrets/cookies_txt (Docker)")
        return COOKIES_SECRET_PATH
    # Priority 3: Local cookies file
    if COOKIES_PATH.exists():
        logger.info("🍪 Using cookies from local cookies.txt")
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

    # Deno/JS runtime check (CRITICAL for n-sig)
    if shutil.which("deno"):
        logger.info("✅ Deno JS runtime found (n-sig solver ready)")
    elif shutil.which("quickjs"):
        logger.info("✅ QuickJS runtime found (n-sig solver ready)")
    else:
        logger.warning("⚠️  No JS runtime (Deno/QuickJS) - n-sig challenges will FAIL!")

    # Node.js check (for youtube-po-token-generator)
    if shutil.which("node"):
        logger.info("✅ Node.js found (auto token generation ready)")
    else:
        logger.warning("⚠️  Node.js not found - auto token generation unavailable")

    # PO Token check (CRITICAL for datacenter IPs)
    if MANUAL_PO_TOKEN:
        logger.info("✅ Using Manual Token from YOUTUBE_PO_TOKEN env var")
    else:
        logger.info("ℹ️  No manual YOUTUBE_PO_TOKEN - will use auto-generation")
        # Verify youtube-po-token-generator CLI is available
        if shutil.which("youtube-po-token-generator"):
            logger.info("✅ youtube-po-token-generator CLI available for auto tokens")
        else:
            logger.warning("⚠️  youtube-po-token-generator CLI not found (npm install -g youtube-po-token-generator)")

    if MANUAL_VISITOR_DATA:
        logger.info("✅ YOUTUBE_VISITOR_DATA configured")

    # Cookies check
    cookies = get_cookies_path()
    if cookies:
        logger.info("✅ cookies.txt found - authenticated mode enabled")
    else:
        logger.info("ℹ️  No cookies.txt - using guest mode with client rotation")

    # Feature summary
    logger.info("✅ Rate limiting: 5 downloads/hour per IP")
    logger.info("✅ Browser impersonation: curl-cffi (chrome)")
    logger.info("✅ Client fallback: mweb → web → android")


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


def build_ydl_opts(for_download: bool = False, include_ffmpeg: bool = False) -> tuple[dict, bool]:
    """
    Build yt-dlp options with Late-2025 Anti-Bot Bypass Stack:
    
    1. Random sleep intervals (5-10s) - avoid linear request patterns
    2. Manual User-Agent (bypass impersonate AssertionError bug)
    3. Client rotation (mweb, web, android) - use multiple player clients
    4. PO Token support - Proof of Origin for datacenter IPs
    5. Extractor args - skip webpage/config to reduce detection surface
    """
    # Get token with priority: Manual > Cached Auto > Fresh Auto
    po_token, visitor_data, token_source = get_po_token()
    
    opts: dict = {
        "verbose": True,  # Enable verbose logging to see exact errors
        "logger": logger,  # Use our custom logger
        "quiet": False,   # Disable quiet mode for debugging
        "no_warnings": False,  # Show warnings for debugging
        "no_color": True,
        # Privacy: don't cache or store anything
        "cachedir": False,
        "writedescription": False,
        "writeinfojson": False,
        "writeannotations": False,
        "writesubtitles": False,
        "writethumbnail": False,
        # Stability: skip format checking for faster metadata analysis
        "check_formats": False,
        "file_access_prefs": [],
        "noplaylist": True,  # Single video only, no playlist expansion
        # Rate limiting: longer sleep to look less like a bot (5-10 seconds)
        "sleep_interval": 5,
        "max_sleep_interval": 10,
        "sleep_interval_requests": random.uniform(2, 5),
        # BYPASS AssertionError: Set impersonate to None and use curl_cffi handler directly
        # This completely bypasses the buggy _impersonate_target_available check
        "impersonate": None,
        "request_handler": "curl_cffi",
        # Manual headers since we're bypassing impersonate
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
        },
    }

    if not for_download:
        opts["skip_download"] = True

    # Add ffmpeg location if available
    if include_ffmpeg and FFMPEG_LOCATION:
        opts["ffmpeg_location"] = FFMPEG_LOCATION

    # Check if cookies are available first (affects client choice)
    cookies = get_cookies_path()
    
    # Build extractor args with smart client rotation based on cookies
    # ios/android clients skip cookies, so use web/mweb when cookies are present
    if cookies:
        # With cookies: use web clients that respect cookies
        player_clients = ["web", "mweb"]
        logger.info("🍪 Cookies detected - using web/mweb clients")
    else:
        # Without cookies: mobile clients are more lenient
        player_clients = ["ios", "android", "web"]
        logger.info("👤 No cookies - using ios/android/web clients")
    
    extractor_args: dict = {
        "youtube": {
            "player_client": player_clients,
            # Skip webpage and configs to reduce detection surface
            "player_skip": ["webpage", "configs"],
        }
    }

    # Add PO Token if available (Manual or Auto-generated)
    if po_token:
        extractor_args["youtube"]["po_token"] = [f"web+{po_token}"]
        logger.info(f"🔑 PO Token applied (source: {token_source})")
    else:
        logger.warning("⚠️ No PO Token - relying on Android client fallback")
    
    # Add Visitor Data if available
    if visitor_data:
        extractor_args["youtube"]["visitor_data"] = [visitor_data]

    opts["extractor_args"] = extractor_args

    # Add cookies if available (with read-only filesystem bypass)
    # Render's /etc/secrets is read-only, so we tell yt-dlp not to save cookies back
    if cookies:
        opts["cookiefile"] = str(cookies)
        # CRITICAL: Prevent yt-dlp from trying to write cookies back to read-only filesystem
        # This is handled by patching cookiejar.save after YoutubeDL init

    return opts, cookies is not None  # Return whether cookies are being used


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


def apply_vocal_removal(input_path: Path, output_dir: Path) -> Path | None:
    """
    Remove vocals using audio-separator (AI-based vocal isolation).
    Returns path to instrumental track, or None on failure.
    
    Uses the UVR-MDX-NET-Inst_HQ_3 model for high-quality instrumental extraction.
    """
    logger.info("🎤 Starting AI vocal removal... (this may take 1-2 minutes)")
    try:
        # audio-separator outputs to a folder, creates files like:
        # - input_(Instrumental)_model.wav
        # - input_(Vocals)_model.wav
        cmd = [
            "audio-separator",
            str(input_path),
            "--model_filename", "UVR-MDX-NET-Inst_HQ_3.onnx",
            "--output_dir", str(output_dir),
            "--output_format", "mp3",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)  # 5 min timeout
        
        if result.returncode != 0:
            logger.error(f"Vocal removal failed: {result.stderr}")
            return None
        
        # Find the instrumental file (contains "Instrumental" in filename)
        instrumental_files = list(output_dir.glob("*(Instrumental)*.mp3"))
        if not instrumental_files:
            # Try alternative naming pattern
            instrumental_files = list(output_dir.glob("*instrumental*.mp3"))
        
        if not instrumental_files:
            logger.error("No instrumental file found after vocal removal")
            return None
        
        logger.info("✅ Vocal removal completed successfully")
        return instrumental_files[0]
    except subprocess.TimeoutExpired:
        logger.error("❌ Vocal removal timed out (exceeded 5 minutes)")
        return None
    except Exception as e:
        logger.error(f"Vocal removal error: {e}")
        return None


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
        # Vocal removal outputs to a subdirectory
        separator_output = output_dir / "separated"
        separator_output.mkdir(exist_ok=True)
        result = apply_vocal_removal(input_path, separator_output)
        return result
    
    return None


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
    Self-healing: invalidates auto token cache on failure to force regeneration.
    """
    logger.info("Analyze request received")  # No URL logged for privacy

    ydl_opts, has_cookies = build_ydl_opts(for_download=False)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # CRITICAL: Patch cookiejar.save to prevent write attempts to read-only filesystem
            if has_cookies and hasattr(ydl, 'cookiejar'):
                ydl.cookiejar.save = lambda *args, **kwargs: None
            info = ydl.extract_info(body.url, download=False)
    except Exception as e:
        error_str = str(e).lower()
        logger.error(f"Analyze failed: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Self-healing: if it looks like a token/auth error, invalidate cache
        if any(keyword in error_str for keyword in ["403", "forbidden", "bot", "token", "sign in"]):
            invalidate_auto_token()
            logger.info("🔄 Self-healing triggered - token cache invalidated")
        
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
def download_audio(
    request: Request,
    url: str = Query(..., description="Video URL"),
    mode: AudioMode = Query("standard", description="Audio processing mode")
):
    """
    Stream the audio (MP3) of the given video URL with optional processing.
    
    Modes:
    - standard: Basic MP3 extraction
    - bass_boost: +10dB bass enhancement
    - nightcore: 1.25x speed + pitch up
    - minus_one: AI vocal removal (karaoke)
    
    Rate limited to 5 downloads per hour per IP.
    """
    logger.info(f"Download request received (mode: {mode})")  # No URL logged for privacy

    if not ffmpeg_available():
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not found. Server configuration error.",
        )

    # First, get video info
    ydl_opts, has_cookies = build_ydl_opts(for_download=False, include_ffmpeg=True)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # CRITICAL: Patch cookiejar.save to prevent write attempts to read-only filesystem
            if has_cookies and hasattr(ydl, 'cookiejar'):
                ydl.cookiejar.save = lambda *args, **kwargs: None
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        error_str = str(e).lower()
        logger.error(f"Download info fetch failed: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Self-healing: if it looks like a token/auth error, invalidate cache
        if any(keyword in error_str for keyword in ["403", "forbidden", "bot", "token", "sign in"]):
            invalidate_auto_token()
            logger.info("🔄 Self-healing triggered - token cache invalidated")
        
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")

    if info is None:
        raise HTTPException(status_code=400, detail="No info for this URL")

    title = sanitize_filename(info.get("title", "audio"))

    # Download to temp file
    tmp_dir = tempfile.mkdtemp()
    tmp_path = Path(tmp_dir)

    ydl_download_opts, has_cookies_dl = build_ydl_opts(for_download=True, include_ffmpeg=True)
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
            # CRITICAL: Patch cookiejar.save to prevent write attempts to read-only filesystem
            if has_cookies_dl and hasattr(ydl, 'cookiejar'):
                ydl.cookiejar.save = lambda *args, **kwargs: None
            ydl.download([url])
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        logger.error(f"Download/conversion failed: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Download/conversion failed: {e}")

    mp3_files = list(tmp_path.glob("*.mp3"))
    if not mp3_files:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="MP3 conversion failed.")

    original_mp3 = mp3_files[0]
    logger.info("Download successful, applying audio processing...")

    # Apply audio processing based on mode
    final_path = process_audio(original_mp3, tmp_path, mode, title)
    
    if final_path is None:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Audio processing failed for mode: {mode}"
        )

    # Determine output filename suffix based on mode
    mode_suffixes = {
        "standard": "",
        "bass_boost": "_bass_boosted",
        "nightcore": "_nightcore",
        "minus_one": "_instrumental",
    }
    suffix = mode_suffixes.get(mode, "")
    output_filename = f"{title}{suffix}.mp3"

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
