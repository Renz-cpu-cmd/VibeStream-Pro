"""
VibeStream Pro API
Late-2025 High-Stability with Invidious/Piped Fallback:
- Primary: yt-dlp with TV + iOS clients
- Fallback: Invidious/Piped APIs (no cookies needed!)
- curl-cffi for TLS fingerprint impersonation
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
import json
import random

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
import yt_dlp

# For async HTTP requests to Invidious/Piped
import httpx

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

# ---------- Cookie File Setup ----------
# Supports both file and base64 env var (for Render/Docker deployments)
import base64

COOKIE_FILE = BACKEND_DIR / "cookies.txt"

# Check for COOKIES_B64 environment variable first (for cloud deployments)
COOKIES_B64 = os.getenv("COOKIES_B64", "")
if COOKIES_B64 and not COOKIE_FILE.exists():
    try:
        decoded_cookies = base64.b64decode(COOKIES_B64).decode("utf-8")
        COOKIE_FILE.write_text(decoded_cookies)
        logger.info("🍪 Cookies created from COOKIES_B64 environment variable")
    except Exception as e:
        logger.warning(f"⚠️  Failed to decode COOKIES_B64: {e}")

USE_COOKIES = COOKIE_FILE.exists() and COOKIE_FILE.stat().st_size > 500  # Must have actual content


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

    # Cookie file check
    if USE_COOKIES:
        logger.info("🍪 Cookie file found - authenticated mode ENABLED")
    
    # YouTube API check
    if YOUTUBE_API_KEY:
        logger.info("🔑 YouTube Data API key configured - using official API")
    else:
        logger.warning("⚠️  No YOUTUBE_API_KEY - set it for reliable metadata!")

    # Feature summary
    logger.info("📺 Primary: yt-dlp with mweb/tv/ios/android clients")
    logger.info("🔄 Fallback: YouTube API → Invidious → Piped → Cobalt")
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
    Build yt-dlp options with Late-2025 bypass strategies.
    
    Key settings (December 2025):
    - Multiple client fallbacks: mweb → tv → ios → android
    - TLS fingerprint impersonation via curl-cffi
    - Retries and fallback extraction
    """
    opts: dict = {
        # Core settings
        "verbose": True,
        "logger": logger,
        "no_color": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        # TLS fingerprint impersonation (Chrome-like)
        "impersonate": "chrome",
        # Multiple client fallback strategy (Dec 2025)
        # mweb (mobile web) often works when others fail
        "extractor_args": {
            "youtube": {
                "player_client": ["mweb", "tv", "ios", "android"],
            }
        },
    }

    # Add cookies if available (bypasses bot detection)
    if USE_COOKIES:
        opts["cookiefile"] = str(COOKIE_FILE)

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


def extract_video_id(url_or_id: str) -> str | None:
    """Extract YouTube video ID from URL or return ID if already an ID."""
    text = url_or_id.strip()
    # Already an ID (11 chars alphanumeric)
    if re.match(r'^[a-zA-Z0-9_-]{11}$', text):
        return text
    # Extract from various YouTube URL formats
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    return None


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


# ---------- YouTube Data API v3 (Official - most reliable) ----------
# Free tier: 10,000 requests/day - Get your key from Google Cloud Console
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")


def get_youtube_api_video_info(video_id: str) -> dict | None:
    """Fetch video info using official YouTube Data API v3."""
    if not YOUTUBE_API_KEY:
        return None
    
    try:
        url = "https://www.googleapis.com/youtube/v3/videos"
        params = {
            "part": "snippet,contentDetails",
            "id": video_id,
            "key": YOUTUBE_API_KEY,
        }
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                if items:
                    item = items[0]
                    snippet = item.get("snippet", {})
                    content = item.get("contentDetails", {})
                    
                    # Parse duration (ISO 8601 format like PT4M13S)
                    duration_str = content.get("duration", "PT0S")
                    duration = parse_iso8601_duration(duration_str)
                    
                    logger.info("✅ YouTube Data API successful")
                    return {
                        "title": snippet.get("title", "Unknown"),
                        "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url"),
                        "duration": duration,
                        "uploader": snippet.get("channelTitle"),
                        "video_id": video_id,
                    }
    except Exception as e:
        logger.warning(f"YouTube Data API failed: {e}")
    return None


def search_youtube_api(query: str) -> dict | None:
    """Search using official YouTube Data API v3."""
    if not YOUTUBE_API_KEY:
        return None
    
    try:
        url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": 1,
            "key": YOUTUBE_API_KEY,
        }
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                if items:
                    item = items[0]
                    video_id = item.get("id", {}).get("videoId")
                    snippet = item.get("snippet", {})
                    logger.info("✅ YouTube API search successful")
                    return {
                        "videoId": video_id,
                        "title": snippet.get("title"),
                        "author": snippet.get("channelTitle"),
                        "videoThumbnails": [{"url": snippet.get("thumbnails", {}).get("high", {}).get("url")}],
                    }
    except Exception as e:
        logger.warning(f"YouTube API search failed: {e}")
    return None


def parse_iso8601_duration(duration: str) -> int:
    """Parse ISO 8601 duration (PT4M13S) to seconds."""
    import re
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration)
    if match:
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)
        return hours * 3600 + minutes * 60 + seconds
    return 0


# ---------- Invidious/Piped Fallback API ----------
# Public instances (updated Dec 2025 - verified working)
# Fetched from https://api.invidious.io/ and https://piped-instances.kavin.rocks/
INVIDIOUS_INSTANCES = [
    "https://vid.puffyan.us",
    "https://invidious.lunar.icu",
    "https://iv.ggtyler.dev",
    "https://invidious.privacyredirect.com",
    "https://invidious.drgns.space",
    "https://inv.us.projectsegfau.lt",
    "https://invidious.io.lol",
    "https://yt.cdaut.de",
]

PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.r4fo.com",
    "https://api.piped.privacydev.net",
    "https://pipedapi.darkness.services",
    "https://pipedapi.syncpundit.io",
    "https://piped-api.lunar.icu",
]

# Cobalt API - updated for v10 API format (Dec 2025)
COBALT_INSTANCES = [
    "https://api.cobalt.tools",
]


def get_cobalt_audio(video_id: str) -> tuple[str, dict] | None:
    """
    Get audio URL using Cobalt API v10 format.
    """
    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    
    for instance in COBALT_INSTANCES:
        try:
            url = f"{instance}/"
            payload = {
                "url": youtube_url,
                "downloadMode": "audio",
                "audioFormat": "mp3",
            }
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
            
            with httpx.Client(timeout=30.0, follow_redirects=True) as client:
                response = client.post(url, json=payload, headers=headers)
                logger.info(f"Cobalt response: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    status = data.get("status")
                    
                    if status in ["tunnel", "redirect", "stream"]:
                        audio_url = data.get("url")
                        if audio_url:
                            logger.info(f"✅ Cobalt fallback successful")
                            return audio_url, {"title": "audio", "video_id": video_id}
                elif response.status_code == 400:
                    # Log the error for debugging
                    try:
                        error_data = response.json()
                        logger.warning(f"Cobalt error: {error_data}")
                    except:
                        pass
                    
        except Exception as e:
            logger.warning(f"Cobalt instance {instance} failed: {e}")
            continue
    return None


def download_with_ytdlp_proxy(video_id: str, output_path: Path) -> bool:
    """
    Try yt-dlp with alternative configurations that might bypass detection.
    """
    configs_to_try = [
        # Config 1: Web creator client (newer, less restricted)
        {
            "extractor_args": {
                "youtube": {
                    "player_client": ["web_creator"],
                }
            },
        },
        # Config 2: TV embed client
        {
            "extractor_args": {
                "youtube": {
                    "player_client": ["tv_embedded"],
                }
            },
        },
        # Config 3: MediaConnect client
        {
            "extractor_args": {
                "youtube": {
                    "player_client": ["mediaconnect"],
                }
            },
        },
    ]
    
    for i, extra_opts in enumerate(configs_to_try):
        try:
            logger.info(f"🔄 Trying yt-dlp config {i+1}...")
            opts = {
                "format": "bestaudio/best",
                "outtmpl": str(output_path / "%(title)s.%(ext)s"),
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }],
            }
            opts.update(extra_opts)
            
            if FFMPEG_LOCATION:
                opts["ffmpeg_location"] = FFMPEG_LOCATION
            if USE_COOKIES:
                opts["cookiefile"] = str(COOKIE_FILE)
            
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
            
            # Check if MP3 was created
            mp3_files = list(output_path.glob("*.mp3"))
            if mp3_files:
                logger.info(f"✅ yt-dlp config {i+1} successful")
                return True
                
        except Exception as e:
            logger.warning(f"yt-dlp config {i+1} failed: {e}")
            continue
    
    return False


def get_invidious_video_info(video_id: str) -> dict | None:
    """Fetch video info from Invidious API (fallback when yt-dlp fails)."""
    instances = INVIDIOUS_INSTANCES.copy()
    random.shuffle(instances)
    
    for instance in instances[:5]:  # Try up to 5 instances
        try:
            url = f"{instance}/api/v1/videos/{video_id}"
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    if "error" not in data:
                        logger.info(f"✅ Invidious fallback successful ({instance})")
                        return data
        except Exception as e:
            logger.warning(f"Invidious instance {instance} failed: {e}")
            continue
    return None


def get_piped_video_info(video_id: str) -> dict | None:
    """Fetch video info from Piped API (fallback when yt-dlp fails)."""
    instances = PIPED_INSTANCES.copy()
    random.shuffle(instances)
    
    for instance in instances[:5]:  # Try up to 5 instances
        try:
            url = f"{instance}/streams/{video_id}"
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    if "error" not in data:
                        logger.info(f"✅ Piped fallback successful ({instance})")
                    return data
        except Exception as e:
            logger.warning(f"Piped instance {instance} failed: {e}")
            continue
    return None


def search_invidious(query: str) -> dict | None:
    """Search for videos using Invidious API."""
    instances = INVIDIOUS_INSTANCES.copy()
    random.shuffle(instances)
    
    for instance in instances[:5]:  # Try more instances
        try:
            url = f"{instance}/api/v1/search"
            params = {"q": query, "type": "video"}
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(url, params=params)
                if response.status_code == 200:
                    results = response.json()
                    if results and len(results) > 0 and isinstance(results, list):
                        logger.info(f"✅ Invidious search successful ({instance})")
                        return results[0]  # Return first result
        except Exception as e:
            logger.warning(f"Invidious search on {instance} failed: {e}")
            continue
    return None


def search_piped(query: str) -> dict | None:
    """Search for videos using Piped API."""
    instances = PIPED_INSTANCES.copy()
    random.shuffle(instances)
    
    for instance in instances[:5]:
        try:
            url = f"{instance}/search"
            params = {"q": query, "filter": "videos"}
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(url, params=params)
                if response.status_code == 200:
                    data = response.json()
                    items = data.get("items", [])
                    if items and len(items) > 0:
                        first = items[0]
                        # Convert Piped format to our format
                        video_url = first.get("url", "")
                        video_id = video_url.split("?v=")[-1] if "?v=" in video_url else None
                        logger.info(f"✅ Piped search successful ({instance})")
                        return {
                            "videoId": video_id,
                            "title": first.get("title"),
                            "author": first.get("uploaderName"),
                            "lengthSeconds": first.get("duration"),
                            "videoThumbnails": [{"url": first.get("thumbnail")}] if first.get("thumbnail") else [],
                        }
        except Exception as e:
            logger.warning(f"Piped search on {instance} failed: {e}")
            continue
    return None


def get_audio_url_from_invidious(video_id: str) -> tuple[str, dict] | None:
    """Get direct audio URL from Invidious."""
    info = get_invidious_video_info(video_id)
    if not info:
        return None
    
    # Find best audio format
    adaptive_formats = info.get("adaptiveFormats", [])
    audio_formats = [f for f in adaptive_formats if f.get("type", "").startswith("audio/")]
    
    if not audio_formats:
        return None
    
    # Sort by bitrate (prefer higher quality)
    audio_formats.sort(key=lambda x: x.get("bitrate", 0), reverse=True)
    best_audio = audio_formats[0]
    
    return best_audio.get("url"), {
        "title": info.get("title", "Unknown"),
        "thumbnail": info.get("videoThumbnails", [{}])[0].get("url") if info.get("videoThumbnails") else None,
        "duration": info.get("lengthSeconds"),
        "uploader": info.get("author"),
        "video_id": video_id,
    }


def get_audio_url_from_piped(video_id: str) -> tuple[str, dict] | None:
    """Get direct audio URL from Piped."""
    info = get_piped_video_info(video_id)
    if not info:
        return None
    
    # Find best audio stream
    audio_streams = info.get("audioStreams", [])
    if not audio_streams:
        return None
    
    # Sort by bitrate
    audio_streams.sort(key=lambda x: x.get("bitrate", 0), reverse=True)
    best_audio = audio_streams[0]
    
    return best_audio.get("url"), {
        "title": info.get("title", "Unknown"),
        "thumbnail": info.get("thumbnailUrl"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
        "video_id": video_id,
    }


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
    Uses Invidious/Piped as fallback when yt-dlp fails.
    """
    logger.info("Analyze request received")  # No URL logged for privacy

    input_text = body.url.strip()
    is_search = not is_url(input_text)
    video_id = extract_video_id(input_text) if not is_search else None

    # Prepare URL (add ytsearch1: prefix if it's a search query)
    prepared_url = prepare_url(input_text)

    ydl_opts = build_ydl_opts(for_download=False)
    info = None
    yt_dlp_error = None

    # Try yt-dlp first
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(prepared_url, download=False)
            
            # For search results, get the first entry
            if info and "entries" in info:
                entries = list(info["entries"])
                info = entries[0] if entries else None
    except Exception as e:
        yt_dlp_error = str(e)
        logger.warning(f"yt-dlp failed, trying fallback: {e}")

    # Fallback chain: YouTube API → Invidious → Piped
    if info is None:
        logger.info("🔄 Attempting fallback APIs...")
        
        # Try YouTube Data API first (most reliable, official)
        if is_search:
            api_result = search_youtube_api(input_text)
            if api_result:
                video_id = api_result.get("videoId")
                info = {
                    "title": api_result.get("title", "Unknown"),
                    "thumbnail": api_result.get("videoThumbnails", [{}])[0].get("url") if api_result.get("videoThumbnails") else None,
                    "duration": None,  # Search doesn't return duration
                    "uploader": api_result.get("author"),
                    "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                }
        elif video_id:
            api_info = get_youtube_api_video_info(video_id)
            if api_info:
                info = {
                    "title": api_info.get("title", "Unknown"),
                    "thumbnail": api_info.get("thumbnail"),
                    "duration": api_info.get("duration"),
                    "uploader": api_info.get("uploader"),
                    "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                }
        
        # If YouTube API failed, try Invidious/Piped
        if info is None:
            if is_search:
                # Search using Invidious first, then Piped
                search_result = search_invidious(input_text)
                if not search_result:
                    search_result = search_piped(input_text)
                
                if search_result:
                    video_id = search_result.get("videoId")
                    info = {
                        "title": search_result.get("title", "Unknown"),
                        "thumbnail": search_result.get("videoThumbnails", [{}])[0].get("url") if search_result.get("videoThumbnails") else None,
                        "duration": search_result.get("lengthSeconds"),
                        "uploader": search_result.get("author"),
                        "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                    }
            elif video_id:
                # Direct video - try Invidious then Piped
                inv_info = get_invidious_video_info(video_id)
                if inv_info:
                    info = {
                        "title": inv_info.get("title", "Unknown"),
                        "thumbnail": inv_info.get("videoThumbnails", [{}])[0].get("url") if inv_info.get("videoThumbnails") else None,
                        "duration": inv_info.get("lengthSeconds"),
                        "uploader": inv_info.get("author"),
                        "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                    }
                else:
                    piped_info = get_piped_video_info(video_id)
                    if piped_info:
                        info = {
                            "title": piped_info.get("title", "Unknown"),
                            "thumbnail": piped_info.get("thumbnailUrl"),
                            "duration": piped_info.get("duration"),
                            "uploader": piped_info.get("uploader"),
                            "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                    }

    if info is None:
        error_detail = f"Could not analyze. yt-dlp: {yt_dlp_error}" if yt_dlp_error else "No results found"
        raise HTTPException(status_code=400, detail=error_detail)

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
    Uses Invidious/Piped as fallback when yt-dlp fails.
    """
    logger.info(f"Download request received (mode: {mode}, trim: {start_time}-{end_time})")

    if not ffmpeg_available():
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not found. Server configuration error.",
        )

    input_text = url.strip()
    is_search = not is_url(input_text)
    video_id = extract_video_id(input_text) if not is_search else None
    
    # Prepare URL (add ytsearch1: prefix if it's a search query)
    prepared_url = prepare_url(input_text)

    # First, get video info
    ydl_opts = build_ydl_opts(for_download=False, include_ffmpeg=True)
    info = None
    use_fallback = False
    fallback_audio_url = None

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(prepared_url, download=False)
            
            # For search results, get the first entry
            if info and "entries" in info:
                entries = list(info["entries"])
                info = entries[0] if entries else None
    except Exception as e:
        logger.warning(f"yt-dlp info fetch failed, trying fallback: {e}")
        use_fallback = True

    # Fallback for info extraction - use YouTube API first (most reliable for metadata)
    if info is None or use_fallback:
        logger.info("🔄 Attempting fallback for download metadata...")
        
        if is_search:
            # Use YouTube API for search (most reliable)
            api_result = search_youtube_api(input_text)
            if api_result:
                video_id = api_result.get("videoId")
                info = {
                    "title": api_result.get("title", "audio"),
                    "uploader": api_result.get("author", ""),
                    "thumbnail": api_result.get("videoThumbnails", [{}])[0].get("url") if api_result.get("videoThumbnails") else None,
                    "duration": None,
                    "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                }
            else:
                # Fallback to Invidious/Piped search
                search_result = search_invidious(input_text)
                if not search_result:
                    search_result = search_piped(input_text)
                if search_result:
                    video_id = search_result.get("videoId")
                    info = {
                        "title": search_result.get("title", "audio"),
                        "uploader": search_result.get("author", ""),
                        "thumbnail": None,
                        "duration": search_result.get("lengthSeconds"),
                        "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                    }
        elif video_id:
            # Direct video - use YouTube API for metadata
            api_info = get_youtube_api_video_info(video_id)
            if api_info:
                info = {
                    "title": api_info.get("title", "audio"),
                    "uploader": api_info.get("uploader", ""),
                    "thumbnail": api_info.get("thumbnail"),
                    "duration": api_info.get("duration"),
                    "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                }
            else:
                # Minimal info if API fails
                info = {
                    "title": "audio",
                    "uploader": "",
                    "thumbnail": None,
                    "duration": None,
                    "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                }

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
    
    download_success = False

    # Try yt-dlp download first (if it wasn't already failing)
    if not use_fallback:
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
            download_success = True
        except Exception as e:
            logger.warning(f"yt-dlp download failed, trying fallback: {e}")
            # Extract video_id for fallback
            if not video_id:
                video_id = extract_video_id(actual_url)

    # Fallback 1: Try alternative yt-dlp configs (web_creator, tv_embedded, etc.)
    if not download_success and video_id:
        logger.info("🔄 Trying alternative yt-dlp configurations...")
        download_success = download_with_ytdlp_proxy(video_id, tmp_path)

    # Fallback 2: Try Cobalt, then Invidious/Piped
    if not download_success and video_id:
        logger.info("🔄 Using Cobalt/Invidious/Piped fallback for audio download...")
        
        fallback_audio_url = None
        
        # Try Cobalt FIRST (most reliable for direct download)
        cobalt_result = get_cobalt_audio(video_id)
        if cobalt_result:
            fallback_audio_url = cobalt_result[0]
            logger.info("✅ Using Cobalt for download")
        else:
            # Try Invidious
            inv_result = get_audio_url_from_invidious(video_id)
            if inv_result:
                fallback_audio_url = inv_result[0]
            else:
                # Try Piped
                piped_result = get_audio_url_from_piped(video_id)
                if piped_result:
                    fallback_audio_url = piped_result[0]
        
        if fallback_audio_url:
            try:
                # Download audio from direct URL
                audio_file_path = tmp_path / f"{title}.webm"
                mp3_file_path = tmp_path / f"{title}.mp3"
                
                logger.info("📥 Downloading audio from fallback source...")
                with httpx.Client(timeout=120.0, follow_redirects=True) as client:
                    with client.stream("GET", fallback_audio_url) as response:
                        response.raise_for_status()
                        with open(audio_file_path, "wb") as f:
                            for chunk in response.iter_bytes(chunk_size=8192):
                                f.write(chunk)
                
                # Convert to MP3 using FFmpeg
                logger.info("🔄 Converting to MP3...")
                ffmpeg_cmd = ["ffmpeg", "-y", "-i", str(audio_file_path), 
                             "-c:a", "libmp3lame", "-q:a", "2", str(mp3_file_path)]
                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=120)
                
                if result.returncode == 0:
                    download_success = True
                    logger.info("✅ Fallback download and conversion successful")
                else:
                    logger.error(f"FFmpeg conversion failed: {result.stderr}")
            except Exception as e:
                logger.error(f"Fallback download failed: {e}")

    if not download_success:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Download failed from all sources. YouTube is blocking requests from this server.")

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
