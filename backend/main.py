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
"""

import logging
import os
import random
import re
import shutil
import tempfile
import traceback
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
            timeout=60  # 60 second timeout
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
        logger.error("❌ Auto Token generation timed out after 60 seconds")
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


def build_ydl_opts(for_download: bool = False, include_ffmpeg: bool = False) -> dict:
    """
    Build yt-dlp options with Late-2025 Anti-Bot Bypass Stack:
    
    1. Random sleep intervals (3-8s) - avoid linear request patterns
    2. Browser impersonation (curl-cffi) - bypass TLS fingerprinting
    3. Client rotation (tv, mweb, ios, android) - use multiple player clients
    4. PO Token support - Proof of Origin for datacenter IPs
    5. User-Agent rotation - unique fingerprint per request
    6. Extractor args - skip webpage/config to reduce detection surface
    """
    opts: dict = {
        "verbose": True,  # Enable verbose logging to see exact errors
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
        # Rate limiting: longer sleep to look less like a bot (5-10 seconds)
        "sleep_interval": 5,
        "max_sleep_interval": 10,
        "sleep_interval_requests": random.uniform(2, 5),
        # Browser impersonation via curl-cffi (bypasses TLS fingerprinting)
        # Use Chrome consistently - DO NOT rotate, as PO Token is tied to Chrome
        "impersonate": "chrome",
    }

    if not for_download:
        opts["skip_download"] = True

    # Add ffmpeg location if available
    if include_ffmpeg and FFMPEG_LOCATION:
        opts["ffmpeg_location"] = FFMPEG_LOCATION

    # Build extractor args with client rotation and PO Token
    # Get token with priority: Manual > Cached Auto > Fresh Auto
    po_token, visitor_data, token_source = get_po_token()
    
    extractor_args: dict = {
        "youtube": {
            # Client priority: mweb + web for PO Token, android as fallback
            # mweb = Mobile web (lowest bot detection, try first)
            # web = Desktop web client (works with PO Token)
            # android = Android client (different security threshold, fallback)
            "player_client": ["mweb", "web", "android"],
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

    # Try cookies if available (authenticated requests)
    cookies = get_cookies_path()
    if cookies:
        opts["cookiefile"] = str(cookies)

    # NOTE: Do NOT set http_headers manually!
    # Let curl-cffi handle headers automatically via "impersonate": "chrome"
    # Manual headers cause fingerprint mismatch (e.g., iPhone UA + Safari impersonate = instant block)

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
    Self-healing: invalidates auto token cache on failure to force regeneration.
    """
    logger.info("Analyze request received")  # No URL logged for privacy

    ydl_opts = build_ydl_opts(for_download=False)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
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
        logger.error(f"Download/conversion failed: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
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
