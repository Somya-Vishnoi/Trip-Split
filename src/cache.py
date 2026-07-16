import os
import sqlite3
import time
import json
from typing import Optional, Any
from src.config import DB_PATH, CACHE_TTL_SECONDS

_is_vercel = os.getenv("VERCEL") is not None
_external_cache = os.getenv("REDIS_URL") is not None or os.getenv("UPSTASH_REDIS_REST_URL") is not None

if _is_vercel and not _external_cache:
    print("[Cache Warning] Cache disabled: running on Vercel with no persistent backend.")

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS api_cache (
            key TEXT PRIMARY KEY,
            value TEXT,
            timestamp REAL
        )
        """
    )
    conn.commit()
    return conn

def get_cached_response(key: str) -> Optional[Any]:
    """
    Retrieve cached data for a given key. Returns deserialized JSON/string if found and within TTL, otherwise None.
    """
    if _is_vercel and not _external_cache:
        return None
    try:
        with _get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value, timestamp FROM api_cache WHERE key = ?", (key,))
            row = cursor.fetchone()
            if row:
                value_str, timestamp = row
                # Check if TTL has expired
                if time.time() - timestamp < CACHE_TTL_SECONDS:
                    try:
                        return json.loads(value_str)
                    except json.JSONDecodeError:
                        return value_str
                else:
                    # Stale cache, delete it
                    cursor.execute("DELETE FROM api_cache WHERE key = ?", (key,))
                    conn.commit()
    except Exception as e:
        # Silently fail caching to not block application execution
        print(f"[Cache Warning] Failed to read from cache: {e}")
    return None

def set_cached_response(key: str, value: Any) -> None:
    """
    Cache data with current timestamp. Value can be any JSON-serializable object or string.
    """
    if _is_vercel and not _external_cache:
        return
    try:
        value_str = json.dumps(value) if not isinstance(value, str) else value
        with _get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO api_cache (key, value, timestamp)
                VALUES (?, ?, ?)
                """,
                (key, value_str, time.time()),
            )
            conn.commit()
    except Exception as e:
        print(f"[Cache Warning] Failed to write to cache: {e}")
        
def clear_expired_cache() -> None:
    """
    Delete all cached entries that exceed the TTL.
    """
    if _is_vercel and not _external_cache:
        return
    try:
        with _get_conn() as conn:
            cutoff = time.time() - CACHE_TTL_SECONDS
            conn.execute("DELETE FROM api_cache WHERE timestamp < ?", (cutoff,))
            conn.commit()
    except Exception as e:
        print(f"[Cache Warning] Failed to clear expired cache: {e}")
