from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ArtifactKind = Literal["thumbnail", "preview", "full"]


@dataclass(frozen=True)
class ImagePaths:
    source_path: Path
    cache_path: Path
    content_type: str


def _is_image_file(p: Path) -> bool:
    ext = p.suffix.lower()
    return ext in {".jpg", ".jpeg", ".png", ".webp"}


def list_album_dirs(albums_source_dir: Path) -> list[Path]:
    if not albums_source_dir.exists():
        return []
    dirs = [p for p in albums_source_dir.iterdir() if p.is_dir() and not p.name.startswith(".")]
    return sorted(dirs, key=lambda p: p.name.lower())


def list_album_images(album_dir: Path) -> list[Path]:
    if not album_dir.exists():
        return []
    files = [p for p in album_dir.iterdir() if p.is_file() and _is_image_file(p) and not p.name.startswith(".")]
    return sorted(files, key=lambda p: p.name.lower())


def _safe_rel_part(part: str) -> str:
    # avoid path traversal by only allowing path name components
    if part in {"", ".", ".."}:
        raise ValueError("invalid path part")
    if "/" in part or "\\" in part:
        raise ValueError("invalid path part")
    return part


def resolve_paths(
    *,
    albums_source_dir: Path,
    cache_dir: Path,
    album: str,
    photo: str,
    enhanced: bool,
    kind: ArtifactKind,
) -> ImagePaths:
    album = _safe_rel_part(album)
    photo = _safe_rel_part(photo)

    source_path = (albums_source_dir / album / photo).resolve()
    # ensure inside albums_source_dir
    base = albums_source_dir.resolve()
    if not str(source_path).startswith(str(base) + os.sep) and source_path != base:
        raise ValueError("invalid source path")

    ext = source_path.suffix.lower()
    content_type = "image/jpeg" if ext in {".jpg", ".jpeg"} else "image/png" if ext == ".png" else "image/webp"

    if kind == "full" and not enhanced:
        # for originals, serve from source directly, no cache
        return ImagePaths(source_path=source_path, cache_path=source_path, content_type=content_type)

    variant_root = cache_dir / ("enhanced" if enhanced else "original") / "albums" / album
    if kind == "thumbnail":
        cache_path = variant_root / "thumbnails" / photo
    elif kind == "preview":
        cache_path = variant_root / "previews" / photo
    else:
        cache_path = variant_root / "full" / photo

    return ImagePaths(source_path=source_path, cache_path=cache_path, content_type=content_type)


def _enhance_image(img: Image.Image) -> Image.Image:
    # Subtle, generally-safe enhancement for scanned pages
    img = ImageOps.autocontrast(img)
    img = ImageEnhance.Contrast(img).enhance(1.12)
    img = ImageEnhance.Sharpness(img).enhance(1.25)
    img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=140, threshold=3))
    return img


def _resize_to_fit(img: Image.Image, max_px: int) -> Image.Image:
    w, h = img.size
    if w <= max_px and h <= max_px:
        return img
    scale = min(max_px / w, max_px / h)
    nw = max(1, int(w * scale))
    nh = max(1, int(h * scale))
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def ensure_artifact(
    *,
    paths: ImagePaths,
    kind: ArtifactKind,
    enhanced: bool,
    max_thumb_px: int = 200,
    max_preview_px: int = 1600,
) -> Path:
    """
    Ensures the artifact exists at paths.cache_path (or paths.source_path for original full).
    Returns the path to serve.
    """
    if kind == "full" and not enhanced:
        return paths.source_path

    if paths.cache_path.exists():
        return paths.cache_path

    paths.cache_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(paths.source_path) as img:
        img.load()
        img = img.convert("RGB") if img.mode not in {"RGB", "L"} else img.convert("RGB")

        if enhanced:
            img = _enhance_image(img)

        if kind == "thumbnail":
            img = _resize_to_fit(img, max_thumb_px)
        elif kind == "preview":
            img = _resize_to_fit(img, max_preview_px)
        else:
            # enhanced full: keep original size
            pass

        # save as JPEG for broad compatibility and good size
        out_path = paths.cache_path
        out_ext = out_path.suffix.lower()
        if out_ext not in {".jpg", ".jpeg"}:
            out_path = out_path.with_suffix(".jpg")

        img.save(out_path, format="JPEG", quality=88, optimize=True, progressive=True)

    # If we changed suffix, prefer serving the written file
    return out_path

