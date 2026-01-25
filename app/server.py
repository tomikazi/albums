from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.routing import APIRouter

from app.auth import authenticate, create_session_token, verify_session_token
from app.config import load_settings
from app.images import ensure_artifact, list_album_dirs, list_album_images, resolve_paths


settings = load_settings()
ALBUMS_SOURCE_DIR = Path(settings.albums_source_dir)
CACHE_DIR = Path(settings.cache_dir)
USERS_FILE = Path(settings.users_file)
ROOT_PATH = settings.root_path  # e.g. "/albums" or ""

COOKIE_NAME = "albums_session"
COOKIE_PATH = ROOT_PATH if ROOT_PATH else "/"

app = FastAPI(title="Albums", docs_url=None, redoc_url=None)
router = APIRouter()


def _current_user(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = verify_session_token(settings.session_secret, token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.username


@router.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    index_path = Path(__file__).parent / "static" / "index.html"
    html = index_path.read_text(encoding="utf-8")
    # Inject the base path for the frontend
    base_tag = f'<base href="{ROOT_PATH}/">' if ROOT_PATH else ""
    script_tag = f'<script>window.BASE_PATH = "{ROOT_PATH}";</script>'
    html = html.replace("<head>", f"<head>\n    {base_tag}\n    {script_tag}", 1)
    return HTMLResponse(html)


@router.get("/app.js")
def app_js() -> FileResponse:
    p = Path(__file__).parent / "static" / "app.js"
    return FileResponse(p, media_type="text/javascript")


@router.get("/app.css")
def app_css() -> FileResponse:
    p = Path(__file__).parent / "static" / "app.css"
    return FileResponse(p, media_type="text/css")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/login")
async def login(request: Request) -> Response:
    body = await request.json()
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    user = authenticate(USERS_FILE, username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username/password")

    token = create_session_token(settings.session_secret, user.username)
    resp = JSONResponse({"ok": True, "username": user.username})
    resp.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=False,  # set true behind HTTPS reverse proxy
        max_age=60 * 60 * 24 * 14,
        path=COOKIE_PATH,
    )
    return resp


@router.post("/logout")
def logout() -> Response:
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE_NAME, path=COOKIE_PATH)
    return resp


@router.get("/me")
def me(username: str = Depends(_current_user)) -> dict[str, str]:
    return {"username": username}


@router.get("/albums")
def albums(username: str = Depends(_current_user)) -> list[dict[str, str]]:
    _ = username
    out: list[dict[str, str]] = []
    for d in list_album_dirs(ALBUMS_SOURCE_DIR):
        out.append({"id": d.name, "title": d.name})
    return out


@router.get("/album/{album}/contents")
def album_contents(album: str, username: str = Depends(_current_user)) -> list[str]:
    _ = username
    album_dir = (ALBUMS_SOURCE_DIR / album).resolve()
    base = ALBUMS_SOURCE_DIR.resolve()
    if not str(album_dir).startswith(str(base) + os.sep) and album_dir != base:
        raise HTTPException(status_code=400, detail="Invalid album")
    if not album_dir.exists() or not album_dir.is_dir():
        raise HTTPException(status_code=404, detail="Album not found")
    photos = [p.name for p in list_album_images(album_dir)]
    return photos


def _bool_param(v: Optional[str]) -> bool:
    if v is None:
        return False
    return v.lower() in {"1", "true", "yes", "on"}


def _serve_image(*, album: str, photo: str, enhanced: bool, kind: str) -> FileResponse:
    try:
        paths = resolve_paths(
            albums_source_dir=ALBUMS_SOURCE_DIR,
            cache_dir=CACHE_DIR,
            album=album,
            photo=photo,
            enhanced=enhanced,
            kind=kind,  # type: ignore[arg-type]
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not paths.source_path.exists():
        raise HTTPException(status_code=404, detail="Photo not found")

    served_path = ensure_artifact(paths=paths, kind=kind, enhanced=enhanced)
    media_type = mimetypes.guess_type(str(served_path))[0] or paths.content_type
    return FileResponse(served_path, media_type=media_type)


@router.get("/thumbnails/{album}/{photo}")
def thumbnails(album: str, photo: str, request: Request, username: str = Depends(_current_user)) -> FileResponse:
    _ = username
    enhanced = _bool_param(request.query_params.get("enhanced"))
    return _serve_image(album=album, photo=photo, enhanced=enhanced, kind="thumbnail")


@router.get("/previews/{album}/{photo}")
def previews(album: str, photo: str, request: Request, username: str = Depends(_current_user)) -> FileResponse:
    _ = username
    enhanced = _bool_param(request.query_params.get("enhanced"))
    return _serve_image(album=album, photo=photo, enhanced=enhanced, kind="preview")


@router.get("/download/{album}/{photo}")
def download(album: str, photo: str, request: Request, username: str = Depends(_current_user)) -> FileResponse:
    _ = username
    enhanced = _bool_param(request.query_params.get("enhanced"))
    resp = _serve_image(album=album, photo=photo, enhanced=enhanced, kind="full")
    resp.headers["Content-Disposition"] = f'attachment; filename="{photo}"'
    return resp


# Mount the router at the configured root path (e.g., "/albums" or "")
app.include_router(router, prefix=ROOT_PATH)


if __name__ == "__main__":
    uvicorn.run(
        "app.server:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )

