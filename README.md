## Albums Project

Minimalist web app to browse scanned photo albums, with on-demand thumbnails/previews.

### Mounts / directories

- **Source (read-only)**: `/photos/albums`
  - Expected structure: `/photos/albums/<album>/<photo>.jpg`
- **Cache (read-write)**: `/cache`
  - Cache: `/cache/original/albums/<album>/{thumbnails,previews}`
- **Users file**: `/config/users.txt` (simple `username:password` lines)

### Environment variables

- **ALBUMS_SOURCE_DIR** (default `/photos/albums`)
- **CACHE_DIR** (default `/cache`)
- **USERS_FILE** (default `/config/users.txt`)
- **PORT** (default `8080`)
- **SESSION_SECRET** (default `change-me-in-prod`)
- **ROOT_PATH** (default empty) — URL path prefix for reverse proxy setups, e.g. `/albums` to serve at `http://host:8080/albums`

### Run with Docker

Build:

```bash
docker build -t albums:local .
```

The Dockerfile uses a multi-stage build for optimal caching:
- **Base stage**: Contains all system and Python dependencies (cached unless dependencies change)
- **Application stage**: Contains only the application code (rebuilds quickly when only code changes)

This means rebuilds are much faster when only application code changes, as Docker reuses the cached base layer with all dependencies.

Run (example):

```bash
docker run --rm -p 8080:8080 \
  -e SESSION_SECRET="replace-with-a-random-secret" \
  -v /photos/albums:/photos/albums:ro \
  -v /photos/cache:/cache \
  -v /photos/config/users.txt:/config/users.txt:ro \
  albums:local
```

Then open `http://<pi>:8080/`.

### Notes

- Auth is intentionally simple (single users file); place this behind your LAN / VPN and preferably behind HTTPS (reverse proxy).

