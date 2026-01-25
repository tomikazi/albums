from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    albums_source_dir: str
    cache_dir: str
    users_file: str
    port: int
    session_secret: str
    root_path: str


def load_settings() -> Settings:
    # Normalize root_path: strip trailing slashes, ensure leading slash if not empty
    raw_root = os.environ.get("ROOT_PATH", "").strip()
    if raw_root:
        raw_root = "/" + raw_root.strip("/")
    return Settings(
        albums_source_dir=os.environ.get("ALBUMS_SOURCE_DIR", "/photos/albums"),
        cache_dir=os.environ.get("CACHE_DIR", "/cache"),
        users_file=os.environ.get("USERS_FILE", "/config/users.txt"),
        port=int(os.environ.get("PORT", "8080")),
        session_secret=os.environ.get("SESSION_SECRET", "change-me-in-prod"),
        root_path=raw_root,
    )

