from __future__ import annotations

import base64
import hashlib
import hmac
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class User:
    username: str


def _parse_users_file(users_file: Path) -> dict[str, str]:
    """
    Simple format:
      username:password
    Blank lines and lines starting with # are ignored.
    """
    users: dict[str, str] = {}
    if not users_file.exists():
        return users
    for raw in users_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        u, p = line.split(":", 1)
        u = u.strip()
        p = p.strip()
        if u and p:
            users[u] = p
    return users


def authenticate(users_file: Path, username: str, password: str) -> Optional[User]:
    users = _parse_users_file(users_file)
    expected = users.get(username)
    if expected is None:
        return None
    # Constant-time compare
    if not hmac.compare_digest(expected.encode("utf-8"), password.encode("utf-8")):
        return None
    return User(username=username)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + pad).encode("ascii"))


def _sign(secret: str, payload: bytes) -> str:
    sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()
    return _b64url(sig)


def create_session_token(secret: str, username: str, ttl_seconds: int = 60 * 60 * 24 * 14) -> str:
    exp = int(time.time()) + int(ttl_seconds)
    payload = f"{username}:{exp}".encode("utf-8")
    token = f"{_b64url(payload)}.{_sign(secret, payload)}"
    return token


def verify_session_token(secret: str, token: str) -> Optional[User]:
    try:
        payload_b64, sig = token.split(".", 1)
        payload = _b64url_decode(payload_b64)
        expected_sig = _sign(secret, payload)
        if not hmac.compare_digest(expected_sig, sig):
            return None
        decoded = payload.decode("utf-8")
        username, exp_s = decoded.rsplit(":", 1)
        if int(exp_s) < int(time.time()):
            return None
        if not username:
            return None
        return User(username=username)
    except Exception:
        return None

