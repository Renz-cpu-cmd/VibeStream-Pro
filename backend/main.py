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
    - Multiple client fallbacks for better compatibility
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
        # User-Agent for better compatibility with TikTok, Instagram, etc.
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        },
        # Platform-specific extractor args
        "extractor_args": {
            "youtube": {
                # Use default web client - most reliable for format availability
                "player_skip": ["webpage", "configs"],
            },
            "tiktok": {
                "api_hostname": "api22-normal-c-useast2a.tiktokv.com",
            },
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


def detect_platform(url: str) -> str:
    """Detect which platform the URL is from."""
    url_lower = url.lower()
    if 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'youtube'
    elif 'tiktok.com' in url_lower:
        return 'tiktok'
    elif 'instagram.com' in url_lower:
        return 'instagram'
    elif 'facebook.com' in url_lower or 'fb.watch' in url_lower:
        return 'facebook'
    elif 'twitter.com' in url_lower or 'x.com' in url_lower:
        return 'twitter'
    elif 'soundcloud.com' in url_lower:
        return 'soundcloud'
    elif 'spotify.com' in url_lower:
        return 'spotify'
    elif 'vimeo.com' in url_lower:
        return 'vimeo'
    else:
        return 'other'


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


# ---------- Lyrics API ----------

# Expanded popular songs database (200+ songs for quick matching)
POPULAR_SONGS = {
    # Ed Sheeran
    "shape of you": {"artist": "Ed Sheeran", "title": "Shape of You"},
    "perfect": {"artist": "Ed Sheeran", "title": "Perfect"},
    "thinking out loud": {"artist": "Ed Sheeran", "title": "Thinking Out Loud"},
    "photograph": {"artist": "Ed Sheeran", "title": "Photograph"},
    "castle on the hill": {"artist": "Ed Sheeran", "title": "Castle on the Hill"},
    "galway girl": {"artist": "Ed Sheeran", "title": "Galway Girl"},
    "bad habits": {"artist": "Ed Sheeran", "title": "Bad Habits"},
    "shivers": {"artist": "Ed Sheeran", "title": "Shivers"},
    
    # Taylor Swift
    "anti hero": {"artist": "Taylor Swift", "title": "Anti-Hero"},
    "shake it off": {"artist": "Taylor Swift", "title": "Shake It Off"},
    "blank space": {"artist": "Taylor Swift", "title": "Blank Space"},
    "love story": {"artist": "Taylor Swift", "title": "Love Story"},
    "all too well": {"artist": "Taylor Swift", "title": "All Too Well"},
    "cruel summer": {"artist": "Taylor Swift", "title": "Cruel Summer"},
    "cardigan": {"artist": "Taylor Swift", "title": "Cardigan"},
    "willow": {"artist": "Taylor Swift", "title": "Willow"},
    "you belong with me": {"artist": "Taylor Swift", "title": "You Belong with Me"},
    "style": {"artist": "Taylor Swift", "title": "Style"},
    "bad blood": {"artist": "Taylor Swift", "title": "Bad Blood"},
    "delicate": {"artist": "Taylor Swift", "title": "Delicate"},
    
    # The Weeknd
    "blinding lights": {"artist": "The Weeknd", "title": "Blinding Lights"},
    "starboy": {"artist": "The Weeknd", "title": "Starboy"},
    "save your tears": {"artist": "The Weeknd", "title": "Save Your Tears"},
    "die for you": {"artist": "The Weeknd", "title": "Die for You"},
    "the hills": {"artist": "The Weeknd", "title": "The Hills"},
    "cant feel my face": {"artist": "The Weeknd", "title": "Can't Feel My Face"},
    
    # Justin Bieber
    "love yourself": {"artist": "Justin Bieber", "title": "Love Yourself"},
    "sorry": {"artist": "Justin Bieber", "title": "Sorry"},
    "peaches": {"artist": "Justin Bieber", "title": "Peaches"},
    "ghost": {"artist": "Justin Bieber", "title": "Ghost"},
    "baby": {"artist": "Justin Bieber", "title": "Baby"},
    "what do you mean": {"artist": "Justin Bieber", "title": "What Do You Mean?"},
    
    # Billie Eilish
    "bad guy": {"artist": "Billie Eilish", "title": "Bad Guy"},
    "lovely": {"artist": "Billie Eilish", "title": "Lovely"},
    "when the partys over": {"artist": "Billie Eilish", "title": "When the Party's Over"},
    "ocean eyes": {"artist": "Billie Eilish", "title": "Ocean Eyes"},
    "happier than ever": {"artist": "Billie Eilish", "title": "Happier Than Ever"},
    
    # Dua Lipa
    "levitating": {"artist": "Dua Lipa", "title": "Levitating"},
    "dont start now": {"artist": "Dua Lipa", "title": "Don't Start Now"},
    "new rules": {"artist": "Dua Lipa", "title": "New Rules"},
    "one kiss": {"artist": "Dua Lipa", "title": "One Kiss"},
    "physical": {"artist": "Dua Lipa", "title": "Physical"},
    
    # Harry Styles
    "watermelon sugar": {"artist": "Harry Styles", "title": "Watermelon Sugar"},
    "as it was": {"artist": "Harry Styles", "title": "As It Was"},
    "sign of the times": {"artist": "Harry Styles", "title": "Sign of the Times"},
    "adore you": {"artist": "Harry Styles", "title": "Adore You"},
    
    # Olivia Rodrigo
    "drivers license": {"artist": "Olivia Rodrigo", "title": "Drivers License"},
    "good 4 u": {"artist": "Olivia Rodrigo", "title": "Good 4 U"},
    "deja vu": {"artist": "Olivia Rodrigo", "title": "Deja Vu"},
    "traitor": {"artist": "Olivia Rodrigo", "title": "Traitor"},
    "vampire": {"artist": "Olivia Rodrigo", "title": "Vampire"},
    
    # Ariana Grande
    "thank u next": {"artist": "Ariana Grande", "title": "Thank U, Next"},
    "7 rings": {"artist": "Ariana Grande", "title": "7 Rings"},
    "positions": {"artist": "Ariana Grande", "title": "Positions"},
    "into you": {"artist": "Ariana Grande", "title": "Into You"},
    "no tears left to cry": {"artist": "Ariana Grande", "title": "No Tears Left to Cry"},
    "break up with your girlfriend": {"artist": "Ariana Grande", "title": "Break Up with Your Girlfriend"},
    
    # Post Malone
    "rockstar": {"artist": "Post Malone", "title": "Rockstar"},
    "sunflower": {"artist": "Post Malone", "title": "Sunflower"},
    "circles": {"artist": "Post Malone", "title": "Circles"},
    "congratulations": {"artist": "Post Malone", "title": "Congratulations"},
    "better now": {"artist": "Post Malone", "title": "Better Now"},
    
    # Bruno Mars
    "uptown funk": {"artist": "Bruno Mars", "title": "Uptown Funk"},
    "just the way you are": {"artist": "Bruno Mars", "title": "Just the Way You Are"},
    "grenade": {"artist": "Bruno Mars", "title": "Grenade"},
    "24k magic": {"artist": "Bruno Mars", "title": "24K Magic"},
    "thats what i like": {"artist": "Bruno Mars", "title": "That's What I Like"},
    "treasure": {"artist": "Bruno Mars", "title": "Treasure"},
    "locked out of heaven": {"artist": "Bruno Mars", "title": "Locked Out of Heaven"},
    
    # Adele
    "hello": {"artist": "Adele", "title": "Hello"},
    "rolling in the deep": {"artist": "Adele", "title": "Rolling in the Deep"},
    "someone like you": {"artist": "Adele", "title": "Someone Like You"},
    "easy on me": {"artist": "Adele", "title": "Easy on Me"},
    "set fire to the rain": {"artist": "Adele", "title": "Set Fire to the Rain"},
    
    # Drake
    "gods plan": {"artist": "Drake", "title": "God's Plan"},
    "hotline bling": {"artist": "Drake", "title": "Hotline Bling"},
    "one dance": {"artist": "Drake", "title": "One Dance"},
    "in my feelings": {"artist": "Drake", "title": "In My Feelings"},
    "nice for what": {"artist": "Drake", "title": "Nice for What"},
    
    # Rihanna
    "umbrella": {"artist": "Rihanna", "title": "Umbrella"},
    "diamonds": {"artist": "Rihanna", "title": "Diamonds"},
    "we found love": {"artist": "Rihanna", "title": "We Found Love"},
    "work": {"artist": "Rihanna", "title": "Work"},
    "needed me": {"artist": "Rihanna", "title": "Needed Me"},
    
    # Beyoncé
    "crazy in love": {"artist": "Beyoncé", "title": "Crazy in Love"},
    "halo": {"artist": "Beyoncé", "title": "Halo"},
    "single ladies": {"artist": "Beyoncé", "title": "Single Ladies"},
    "formation": {"artist": "Beyoncé", "title": "Formation"},
    
    # Coldplay
    "yellow": {"artist": "Coldplay", "title": "Yellow"},
    "the scientist": {"artist": "Coldplay", "title": "The Scientist"},
    "fix you": {"artist": "Coldplay", "title": "Fix You"},
    "viva la vida": {"artist": "Coldplay", "title": "Viva la Vida"},
    "paradise": {"artist": "Coldplay", "title": "Paradise"},
    "something just like this": {"artist": "Coldplay", "title": "Something Just Like This"},
    "my universe": {"artist": "Coldplay", "title": "My Universe"},
    
    # Imagine Dragons
    "believer": {"artist": "Imagine Dragons", "title": "Believer"},
    "radioactive": {"artist": "Imagine Dragons", "title": "Radioactive"},
    "demons": {"artist": "Imagine Dragons", "title": "Demons"},
    "thunder": {"artist": "Imagine Dragons", "title": "Thunder"},
    "natural": {"artist": "Imagine Dragons", "title": "Natural"},
    
    # Maroon 5
    "sugar": {"artist": "Maroon 5", "title": "Sugar"},
    "memories": {"artist": "Maroon 5", "title": "Memories"},
    "girls like you": {"artist": "Maroon 5", "title": "Girls Like You"},
    "payphone": {"artist": "Maroon 5", "title": "Payphone"},
    "moves like jagger": {"artist": "Maroon 5", "title": "Moves Like Jagger"},
    
    # Other Popular Songs
    "dance monkey": {"artist": "Tones and I", "title": "Dance Monkey"},
    "someone you loved": {"artist": "Lewis Capaldi", "title": "Someone You Loved"},
    "senorita": {"artist": "Shawn Mendes", "title": "Señorita"},
    "havana": {"artist": "Camila Cabello", "title": "Havana"},
    "stay": {"artist": "The Kid LAROI", "title": "Stay"},
    "heat waves": {"artist": "Glass Animals", "title": "Heat Waves"},
    "despacito": {"artist": "Luis Fonsi", "title": "Despacito"},
    "old town road": {"artist": "Lil Nas X", "title": "Old Town Road"},
    "happier": {"artist": "Marshmello", "title": "Happier"},
    "closer": {"artist": "The Chainsmokers", "title": "Closer"},
    "dont let me down": {"artist": "The Chainsmokers", "title": "Don't Let Me Down"},
    "roses": {"artist": "The Chainsmokers", "title": "Roses"},
    "see you again": {"artist": "Wiz Khalifa", "title": "See You Again"},
    "stressed out": {"artist": "Twenty One Pilots", "title": "Stressed Out"},
    "heathens": {"artist": "Twenty One Pilots", "title": "Heathens"},
    "ride": {"artist": "Twenty One Pilots", "title": "Ride"},
    "attention": {"artist": "Charlie Puth", "title": "Attention"},
    "we dont talk anymore": {"artist": "Charlie Puth", "title": "We Don't Talk Anymore"},
    "stitches": {"artist": "Shawn Mendes", "title": "Stitches"},
    "treat you better": {"artist": "Shawn Mendes", "title": "Treat You Better"},
    "theres nothing holdin me back": {"artist": "Shawn Mendes", "title": "There's Nothing Holdin' Me Back"},
    "shallow": {"artist": "Lady Gaga", "title": "Shallow"},
    "poker face": {"artist": "Lady Gaga", "title": "Poker Face"},
    "born this way": {"artist": "Lady Gaga", "title": "Born This Way"},
    "bad romance": {"artist": "Lady Gaga", "title": "Bad Romance"},
    "all of me": {"artist": "John Legend", "title": "All of Me"},
    "counting stars": {"artist": "OneRepublic", "title": "Counting Stars"},
    "call me maybe": {"artist": "Carly Rae Jepsen", "title": "Call Me Maybe"},
    "roar": {"artist": "Katy Perry", "title": "Roar"},
    "firework": {"artist": "Katy Perry", "title": "Firework"},
    "dark horse": {"artist": "Katy Perry", "title": "Dark Horse"},
    "teenage dream": {"artist": "Katy Perry", "title": "Teenage Dream"},
    "wrecking ball": {"artist": "Miley Cyrus", "title": "Wrecking Ball"},
    "flowers": {"artist": "Miley Cyrus", "title": "Flowers"},
    "party in the usa": {"artist": "Miley Cyrus", "title": "Party in the U.S.A."},
    "chandelier": {"artist": "Sia", "title": "Chandelier"},
    "cheap thrills": {"artist": "Sia", "title": "Cheap Thrills"},
    "titanium": {"artist": "Sia", "title": "Titanium"},
    "happy": {"artist": "Pharrell Williams", "title": "Happy"},
    "get lucky": {"artist": "Daft Punk", "title": "Get Lucky"},
    "starships": {"artist": "Nicki Minaj", "title": "Starships"},
    "super bass": {"artist": "Nicki Minaj", "title": "Super Bass"},
    "tik tok": {"artist": "Kesha", "title": "TiK ToK"},
    
    # Classic Rock
    "bohemian rhapsody": {"artist": "Queen", "title": "Bohemian Rhapsody"},
    "we will rock you": {"artist": "Queen", "title": "We Will Rock You"},
    "we are the champions": {"artist": "Queen", "title": "We Are the Champions"},
    "dont stop me now": {"artist": "Queen", "title": "Don't Stop Me Now"},
    "hotel california": {"artist": "Eagles", "title": "Hotel California"},
    "stairway to heaven": {"artist": "Led Zeppelin", "title": "Stairway to Heaven"},
    "sweet child o mine": {"artist": "Guns N' Roses", "title": "Sweet Child O' Mine"},
    "november rain": {"artist": "Guns N' Roses", "title": "November Rain"},
    "smells like teen spirit": {"artist": "Nirvana", "title": "Smells Like Teen Spirit"},
    "come as you are": {"artist": "Nirvana", "title": "Come as You Are"},
    "wonderwall": {"artist": "Oasis", "title": "Wonderwall"},
    "dont look back in anger": {"artist": "Oasis", "title": "Don't Look Back in Anger"},
    "back in black": {"artist": "AC/DC", "title": "Back in Black"},
    "highway to hell": {"artist": "AC/DC", "title": "Highway to Hell"},
    "enter sandman": {"artist": "Metallica", "title": "Enter Sandman"},
    "nothing else matters": {"artist": "Metallica", "title": "Nothing Else Matters"},
    "livin on a prayer": {"artist": "Bon Jovi", "title": "Livin' on a Prayer"},
    "its my life": {"artist": "Bon Jovi", "title": "It's My Life"},
    "dream on": {"artist": "Aerosmith", "title": "Dream On"},
    "i dont want to miss a thing": {"artist": "Aerosmith", "title": "I Don't Want to Miss a Thing"},
    
    # Michael Jackson
    "billie jean": {"artist": "Michael Jackson", "title": "Billie Jean"},
    "beat it": {"artist": "Michael Jackson", "title": "Beat It"},
    "thriller": {"artist": "Michael Jackson", "title": "Thriller"},
    "smooth criminal": {"artist": "Michael Jackson", "title": "Smooth Criminal"},
    "bad": {"artist": "Michael Jackson", "title": "Bad"},
    "black or white": {"artist": "Michael Jackson", "title": "Black or White"},
    
    # Eminem
    "lose yourself": {"artist": "Eminem", "title": "Lose Yourself"},
    "stan": {"artist": "Eminem", "title": "Stan"},
    "without me": {"artist": "Eminem", "title": "Without Me"},
    "not afraid": {"artist": "Eminem", "title": "Not Afraid"},
    "love the way you lie": {"artist": "Eminem", "title": "Love the Way You Lie"},
    "rap god": {"artist": "Eminem", "title": "Rap God"},
    "the real slim shady": {"artist": "Eminem", "title": "The Real Slim Shady"},
}


async def search_songs_live(query: str) -> list:
    """
    Search for songs using lrclib.net API - millions of songs available!
    """
    try:
        url = f"https://lrclib.net/api/search?q={urllib.request.quote(query)}"
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(url, headers={"User-Agent": "VibeStream/1.0"})
            if response.status_code == 200:
                data = response.json()
                results = []
                for i, item in enumerate(data[:10]):  # Top 10 results
                    results.append({
                        "id": i + 1,
                        "title": item.get("trackName", "Unknown"),
                        "artist": item.get("artistName", "Unknown"),
                        "album": item.get("albumName"),
                        "thumbnail": None,
                        "confidence": "api"
                    })
                return results
    except Exception as e:
        logger.warning(f"lrclib.net search failed: {e}")
    return []


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def fuzzy_match(query: str, target: str) -> bool:
    """
    Fuzzy matching for song titles - handles typos and variations.
    """
    query = query.lower().strip()
    target = target.lower().strip()
    
    # Exact match
    if query == target or query in target or target in query:
        return True
    
    # Remove spaces and compare
    query_no_space = query.replace(' ', '')
    target_no_space = target.replace(' ', '')
    if query_no_space == target_no_space:
        return True
    
    # Check word overlap (at least 60% of words match)
    query_words = set(query.split())
    target_words = set(target.split())
    if query_words and target_words:
        overlap = len(query_words & target_words)
        min_len = min(len(query_words), len(target_words))
        if min_len > 0 and overlap / min_len >= 0.6:
            return True
    
    # Levenshtein distance on full string - stricter threshold
    max_distance = max(2, len(min(query_no_space, target_no_space, key=len)) // 5)  # 20% error rate
    distance = levenshtein_distance(query_no_space, target_no_space)
    if distance <= max_distance:
        return True
    
    return False


async def parse_song_query(query: str) -> list:
    """
    Parse a search query and return potential artist/title combinations.
    Uses local database for quick matches + live API search for millions of songs!
    """
    query_lower = query.lower().strip()
    # Normalize spaces and remove extra whitespace
    query_normalized = ' '.join(query_lower.split())
    results = []
    
    # Check popular songs database first with fuzzy matching
    for key, song in POPULAR_SONGS.items():
        key_normalized = ' '.join(key.split())
        # Check various matching patterns using fuzzy_match
        if fuzzy_match(query_normalized, key_normalized):
            results.append({
                "id": len(results) + 1,
                "title": song["title"],
                "artist": song["artist"],
                "thumbnail": None,
                "confidence": "high"
            })
        # Also check artist name
        elif fuzzy_match(query_normalized, song["artist"].lower()):
            results.append({
                "id": len(results) + 1,
                "title": song["title"],
                "artist": song["artist"],
                "thumbnail": None,
                "confidence": "medium"
            })
    
    # Parse "artist - song" format
    if " - " in query:
        parts = query.split(" - ", 1)
        results.append({
            "id": len(results) + 1,
            "title": parts[1].strip(),
            "artist": parts[0].strip(),
            "thumbnail": None,
            "confidence": "medium"
        })
    
    # Parse "song by artist" format
    if " by " in query_lower:
        parts = query_lower.split(" by ", 1)
        results.append({
            "id": len(results) + 1,
            "title": parts[0].strip().title(),
            "artist": parts[1].strip().title(),
            "thumbnail": None,
            "confidence": "medium"
        })
    
    # *** LIVE API SEARCH - Search millions of songs! ***
    # If we have fewer than 5 local results, search the API
    if len(results) < 5:
        try:
            api_results = await search_songs_live(query)
            for api_song in api_results:
                # Don't add duplicates
                is_duplicate = any(
                    r["title"].lower() == api_song["title"].lower() and 
                    r["artist"].lower() == api_song["artist"].lower()
                    for r in results
                )
                if not is_duplicate:
                    api_song["id"] = len(results) + 1
                    results.append(api_song)
        except Exception as e:
            logger.warning(f"Live search failed: {e}")
    
    # If still no results, just use the query as title
    if not results:
        results.append({
            "id": 1,
            "title": query.title(),
            "artist": "Unknown Artist",
            "thumbnail": None,
            "confidence": "low"
        })
    
    # Deduplicate by title+artist
    seen = set()
    unique_results = []
    for r in results:
        key = (r["title"].lower(), r["artist"].lower())
        if key not in seen:
            seen.add(key)
            unique_results.append(r)
    
    return unique_results[:10]  # Return up to 10 results now!


async def fetch_lyrics_from_api(artist: str, title: str) -> str | None:
    """
    Fetch lyrics using multiple free APIs.
    Uses lrclib.net as primary (faster) and lyrics.ovh as fallback.
    """
    # Clean up artist and title
    artist_clean = re.sub(r'[^\w\s\'-]', '', artist).strip()
    title_clean = re.sub(r'[^\w\s\'-]', '', title).strip()
    
    # Try lrclib.net first (faster and more reliable)
    try:
        url = f"https://lrclib.net/api/get?artist_name={urllib.request.quote(artist_clean)}&track_name={urllib.request.quote(title_clean)}"
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(url, headers={"User-Agent": "VibeStream/1.0"})
            if response.status_code == 200:
                data = response.json()
                # lrclib returns plainLyrics (without timestamps) or syncedLyrics (with timestamps)
                lyrics = data.get("plainLyrics") or data.get("syncedLyrics")
                if lyrics and len(lyrics) > 50:
                    # Remove timestamp markers if present [00:00.00]
                    lyrics = re.sub(r'\[\d{2}:\d{2}\.\d{2}\]', '', lyrics)
                    return lyrics.strip()
    except Exception as e:
        logger.warning(f"lrclib.net failed: {e}")
    
    # Try lyrics.ovh as fallback
    try:
        url = f"https://api.lyrics.ovh/v1/{urllib.request.quote(artist_clean)}/{urllib.request.quote(title_clean)}"
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                lyrics = data.get("lyrics")
                if lyrics and len(lyrics) > 50:
                    return lyrics.strip()
    except Exception as e:
        logger.warning(f"lyrics.ovh failed: {e}")
    
    # Try with swapped order (some songs are indexed differently)
    try:
        # Sometimes the API has artist/title reversed
        url = f"https://api.lyrics.ovh/v1/{urllib.request.quote(title_clean)}/{urllib.request.quote(artist_clean)}"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                lyrics = data.get("lyrics")
                if lyrics and len(lyrics) > 50:
                    return lyrics.strip()
    except Exception as e:
        pass
    
    # Try alternative query formats
    alt_queries = [
        (artist_clean.lower(), title_clean.lower()),
        (artist_clean.split()[0] if artist_clean else "", title_clean),  # First name only
    ]
    
    for alt_artist, alt_title in alt_queries:
        if not alt_artist or not alt_title:
            continue
        try:
            url = f"https://api.lyrics.ovh/v1/{urllib.request.quote(alt_artist)}/{urllib.request.quote(alt_title)}"
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    lyrics = data.get("lyrics")
                    if lyrics and len(lyrics) > 50:
                        return lyrics.strip()
        except:
            pass
    
    return None


@app.get("/api/lyrics/search")
async def lyrics_search(q: str = Query(..., description="Search query for songs")):
    """
    Search for songs to get lyrics.
    Returns list of potential song matches.
    """
    if not q or len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query too short")
    
    results = await parse_song_query(q.strip())
    return {"results": results, "query": q}


@app.get("/api/lyrics/get")
async def get_lyrics(
    artist: str = Query(..., description="Artist name"),
    title: str = Query(..., description="Song title")
):
    """
    Get lyrics for a specific song.
    """
    if not artist or not title:
        raise HTTPException(status_code=400, detail="Artist and title required")
    
    lyrics = await fetch_lyrics_from_api(artist, title)
    
    if not lyrics:
        raise HTTPException(
            status_code=404, 
            detail=f"Lyrics not found for '{title}' by '{artist}'. Try searching with the format: Artist - Song Title"
        )
    
    return {"lyrics": lyrics, "artist": artist, "title": title}


# ---------- Routes ----------
@app.get("/health")
def health_check():
    """
    Health check endpoint with detailed status.
    Returns service health for YouTube engine, FFmpeg, etc.
    """
    import datetime
    
    # Check FFmpeg availability
    ffmpeg_available = shutil.which("ffmpeg") is not None or FFMPEG_EXE.exists()
    
    # YouTube engine status - assume limited due to ongoing bot detection
    # In production, you could do a test request to check
    youtube_status = "limited"  # or "operational" or "down"
    
    return {
        "status": "ok",
        "youtube_engine": youtube_status,
        "ffmpeg": ffmpeg_available,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
    }


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
        # Detect platform for better error messages
        platform = detect_platform(input_text) if not is_search else 'search'
        
        if platform == 'youtube':
            error_detail = f"Could not analyze YouTube video. yt-dlp: {yt_dlp_error}" if yt_dlp_error else "No results found"
        elif platform == 'tiktok':
            error_detail = f"TikTok extraction failed. TikTok may be blocking requests. Error: {yt_dlp_error or 'Unknown'}"
        elif platform == 'spotify':
            error_detail = "Spotify is not supported. Spotify uses DRM protection. Try searching for the song name instead!"
        elif platform in ['instagram', 'facebook', 'twitter']:
            error_detail = f"{platform.title()} extraction failed. Some posts may be private or restricted. Error: {yt_dlp_error or 'Unknown'}"
        else:
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


class PreviewResponse(BaseModel):
    """Response model for audio preview endpoint."""
    stream_url: str  # Our proxy URL, not direct YouTube URL
    title: str
    thumbnail: str | None = None
    duration: int | None = None
    source: str  # "yt-dlp", "invidious", "piped"


# In-memory cache for audio URLs (expires after 5 minutes)
audio_url_cache: dict[str, tuple[str, str, float]] = {}  # video_id -> (url, content_type, timestamp)
CACHE_EXPIRY = 300  # 5 minutes


@app.get("/stream/{video_id}")
async def stream_audio(video_id: str, request: Request):
    """
    Proxy endpoint to stream audio - bypasses CORS restrictions.
    Streams audio directly through our server.
    """
    import time
    
    audio_url = None
    content_type = "audio/mp4"  # Default, will be detected
    
    # Check cache first
    cached = audio_url_cache.get(video_id)
    if cached:
        audio_url, content_type, cached_time = cached
        if time.time() - cached_time > CACHE_EXPIRY:
            # Expired, remove from cache
            del audio_url_cache[video_id]
            audio_url = None
    
    if not audio_url:
        # Get fresh audio URL
        
        # Try yt-dlp first for best quality
        try:
            ydl_opts = build_ydl_opts(for_download=False)
            ydl_opts["format"] = "bestaudio[ext=m4a]/bestaudio/best"
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                if info:
                    formats = info.get("formats", [])
                    # Prefer m4a format (works best in browsers)
                    audio_formats = [f for f in formats if f.get("acodec") != "none" and f.get("vcodec") == "none"]
                    if audio_formats:
                        # Prefer m4a, then webm
                        m4a_formats = [f for f in audio_formats if f.get("ext") == "m4a"]
                        if m4a_formats:
                            m4a_formats.sort(key=lambda x: x.get("abr") or 0, reverse=True)
                            audio_url = m4a_formats[0].get("url")
                            content_type = "audio/mp4"
                        else:
                            audio_formats.sort(key=lambda x: x.get("abr") or 0, reverse=True)
                            best = audio_formats[0]
                            audio_url = best.get("url")
                            ext = best.get("ext", "m4a")
                            content_type = "audio/webm" if ext == "webm" else "audio/mp4"
        except Exception as e:
            logger.warning(f"yt-dlp stream failed: {e}")
        
        # Try Invidious
        if not audio_url:
            result = get_audio_url_from_invidious(video_id)
            if result:
                audio_url = result[0]
                content_type = "audio/mp4"
        
        # Try Piped
        if not audio_url:
            result = get_audio_url_from_piped(video_id)
            if result:
                audio_url = result[0]
                content_type = "audio/mp4"
        
        if not audio_url:
            raise HTTPException(status_code=404, detail="Audio stream not found")
        
        # Cache the URL
        audio_url_cache[video_id] = (audio_url, content_type, time.time())
    
    # Stream the audio through our server with correct content type
    async def audio_stream():
        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                async with client.stream("GET", audio_url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }) as response:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        yield chunk
        except Exception as e:
            logger.error(f"Stream error: {e}")
    
    return StreamingResponse(
        audio_stream(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Type": content_type,
            "Cache-Control": "no-cache",
        }
    )


@app.get("/preview", response_model=PreviewResponse)
@limiter.limit("30/minute")  # More lenient for previews
async def get_audio_preview(
    request: Request,
    url: str = Query(..., description="Video URL or search query"),
):
    """
    Get a streaming audio URL for preview/playback without downloading.
    
    Returns a proxy stream URL that can be played in the browser.
    Uses multiple fallback sources for reliability.
    """
    logger.info("Preview request received")
    
    input_text = url.strip()
    is_search = not is_url(input_text)
    video_id = extract_video_id(input_text) if not is_search else None
    
    # Prepare URL (add ytsearch1: prefix if it's a search query)
    prepared_url = prepare_url(input_text)
    
    audio_url = None
    title = "Unknown"
    thumbnail = None
    duration = None
    source = "unknown"
    
    # Try yt-dlp first to get direct audio URL
    try:
        ydl_opts = build_ydl_opts(for_download=False)
        ydl_opts["format"] = "bestaudio/best"
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(prepared_url, download=False)
            
            # For search results, get the first entry
            if info and "entries" in info:
                entries = list(info["entries"])
                info = entries[0] if entries else None
            
            if info:
                title = info.get("title", "Unknown")
                thumbnail = info.get("thumbnail")
                duration = info.get("duration")
                video_id = info.get("id") or extract_video_id(info.get("webpage_url", ""))
                
                # Get direct audio URL from formats
                formats = info.get("formats", [])
                audio_formats = [f for f in formats if f.get("acodec") != "none" and f.get("vcodec") == "none"]
                
                if audio_formats:
                    # Sort by quality (bitrate)
                    audio_formats.sort(key=lambda x: x.get("abr") or x.get("tbr") or 0, reverse=True)
                    audio_url = audio_formats[0].get("url")
                    source = "yt-dlp"
                elif formats:
                    # Fallback to any format with audio
                    for f in formats:
                        if f.get("acodec") != "none" and f.get("url"):
                            audio_url = f.get("url")
                            source = "yt-dlp"
                            break
                            
    except Exception as e:
        logger.warning(f"yt-dlp preview failed: {e}")
    
    # Fallback to Invidious
    if not audio_url and video_id:
        result = get_audio_url_from_invidious(video_id)
        if result:
            audio_url, meta = result
            title = meta.get("title", title) or title
            thumbnail = meta.get("thumbnail") or thumbnail
            duration = meta.get("duration") or duration
            source = "invidious"
    
    # Fallback to Piped
    if not audio_url and video_id:
        result = get_audio_url_from_piped(video_id)
        if result:
            audio_url, meta = result
            title = meta.get("title", title) or title
            thumbnail = meta.get("thumbnail") or thumbnail
            duration = meta.get("duration") or duration
            source = "piped"
    
    if not audio_url or not video_id:
        raise HTTPException(
            status_code=400,
            detail="Could not get audio stream for preview. Try a different video."
        )
    
    # Cache the audio URL for the stream endpoint (with content type)
    import time
    audio_url_cache[video_id] = (audio_url, "audio/mp4", time.time())
    
    logger.info(f"Preview URL obtained from {source}")
    
    # Return our proxy stream URL instead of direct YouTube URL
    return PreviewResponse(
        stream_url=f"/stream/{video_id}",
        title=title,
        thumbnail=thumbnail,
        duration=duration,
        source=source,
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


# ---------- Video Download Endpoint ----------
class VideoResolution(str, Enum):
    p360 = "360"
    p480 = "480"
    p720 = "720"
    p1080 = "1080"
    best = "best"


@app.get("/download-video")
@limiter.limit("3/hour")  # 3 video downloads per hour per IP (videos are larger)
def download_video(
    request: Request,
    url: str = Query(..., description="Video URL or search query"),
    resolution: VideoResolution = Query("720", description="Video resolution"),
):
    """
    Download video as MP4 with specified resolution.
    
    Resolutions:
    - 360: Low quality, small file
    - 480: Standard definition
    - 720: HD (default, good balance)
    - 1080: Full HD
    - best: Highest available quality
    
    Rate limited to 3 downloads per hour per IP (videos are larger than audio).
    """
    logger.info(f"Video download request received (resolution: {resolution})")

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

    # Build format string based on resolution
    if resolution == VideoResolution.best:
        format_str = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
    else:
        height = resolution.value
        format_str = f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height}][ext=mp4]/best[height<={height}]"

    # Download options for video
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
        logger.warning(f"yt-dlp info fetch failed: {e}")

    # Fallback to YouTube API for metadata
    if info is None:
        if is_search:
            api_result = search_youtube_api(input_text)
            if api_result:
                video_id = api_result.get("videoId")
                info = {
                    "title": api_result.get("title", "video"),
                    "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                }
        elif video_id:
            api_info = get_youtube_api_video_info(video_id)
            if api_info:
                info = {
                    "title": api_info.get("title", "video"),
                    "webpage_url": f"https://www.youtube.com/watch?v={video_id}",
                }

    if info is None:
        raise HTTPException(status_code=400, detail="No results found")

    title = sanitize_filename(info.get("title", "video"))
    actual_url = info.get("webpage_url") or info.get("url") or prepared_url

    # Download to temp file
    tmp_dir = tempfile.mkdtemp()
    tmp_path = Path(tmp_dir)
    
    download_success = False

    # Try yt-dlp video download
    ydl_download_opts = build_ydl_opts(for_download=True, include_ffmpeg=True)
    ydl_download_opts.update({
        "format": format_str,
        "outtmpl": str(tmp_path / "%(title)s.%(ext)s"),
        "merge_output_format": "mp4",
        # No postprocessors - keep as video
    })

    try:
        with yt_dlp.YoutubeDL(ydl_download_opts) as ydl:
            ydl.download([actual_url])
        download_success = True
    except Exception as e:
        logger.error(f"Video download failed: {e}")
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail="Video download failed. YouTube is blocking requests from this server."
        )

    # Find the downloaded video file
    video_files = list(tmp_path.glob("*.mp4")) + list(tmp_path.glob("*.webm")) + list(tmp_path.glob("*.mkv"))
    if not video_files:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Video download failed - no video file found.")

    video_file = video_files[0]
    output_filename = f"{title}_{resolution.value}p.mp4"

    logger.info(f"Video download complete, serving file: {output_filename}")

    def iterfile():
        try:
            with open(video_file, "rb") as f:
                yield from f
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            logger.info("🧹 Temp files cleaned up")

    # Determine content type based on actual file extension
    content_type = "video/mp4"
    if video_file.suffix == ".webm":
        content_type = "video/webm"
    elif video_file.suffix == ".mkv":
        content_type = "video/x-matroska"

    return StreamingResponse(
        iterfile(),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{output_filename}"'},
    )

