# Docker Deployment Guide

This guide explains how to deploy the BatchVault frontend using Docker with runtime configuration.

## Architecture Overview

The application uses **multi-stage Docker build** with **runtime configuration**:

- ✅ **Pre-built image** - Application is built during `docker build`, not at container start
- ✅ **Fast container startup** - Containers start instantly with `npm start`
- ✅ **No secrets in image** - Personal tokens and URLs are set at runtime via docker-compose
- ✅ **Universal image** - One image works for all users with different configurations

## Quick Start

### 1. Pull the Image

```bash
docker pull ghcr.io/dzarlax/batchvault-front:latest
```

### 2. Create docker-compose.yaml

```yaml
services:
  jerky_vault_frontend:
    image: ghcr.io/dzarlax/batchvault-front:latest
    ports:
      - "3000:3000"
    environment:
      # Your backend API URL
      NEXT_PUBLIC_API_URL: 'http://your-backend-url.com'
      # Your Mapbox access token (get from https://www.mapbox.com/)
      MAPBOX_ACCESS_TOKEN: 'your_mapbox_token_here'
    restart: unless-stopped
```

### 3. Start the Container

```bash
docker-compose up -d
```

The application will be available at `http://localhost:3000`

## Local Docker Preview

Use the dev compose template when you want a reusable local stack. The frontend
serves the production build from the working tree, and the backend runs directly
from mounted Go files with cached Go module/build volumes:

```bash
cp docker-compose.dev.yml.example docker-compose.dev.yml
docker compose -f docker-compose.dev.yml up backend frontend
```

The default template starts both frontend and backend. The frontend points to the
local backend origin: `http://127.0.0.1:8080`. The app adds `/api` in its
request paths.

Set `BATCHVAULT_DATABASE_URL` in your ignored `docker-compose.dev.yml` or shell.
Override `BATCHVAULT_API_URL` only when needed; this avoids accidental
interference from the app's normal `NEXT_PUBLIC_API_URL` setting.

After changing frontend source, rebuild the Next.js dist inside Docker and
restart the existing serving container:

```bash
docker compose -f docker-compose.dev.yml run --rm builder
docker compose -f docker-compose.dev.yml restart frontend
```

After changing backend source, restart the Go runner without rebuilding a backend
image. The backend service uses `sh -c` deliberately so the Go image `PATH`
keeps `/usr/local/go/bin`:

```bash
docker compose -f docker-compose.dev.yml restart backend
```

For a production-like backend image check, run the image profile on a separate
host port:

```bash
docker compose -f docker-compose.dev.yml --profile image up -d --build backend-image
```

### Moving to the Next Backend Branch

The local `backend` service mounts one backend git worktree. When this frontend
branch is finished and a new backend branch is created, update only your ignored
`docker-compose.dev.yml`:

```yaml
services:
  backend:
    volumes:
      - ./_worktrees/<new-backend-worktree>:/app
```

Then recreate the local stack:

```bash
docker compose -f docker-compose.dev.yml up -d --force-recreate backend frontend
```

Backend source commits, pushes, and pull requests must still be made from the
backend repository/worktree. The `backend` service is for fast `go run .`
development; the production backend image is updated by the backend repository's
CI after its PR is merged.

`docker-compose.dev.yml` is intentionally ignored so local ports and API URLs can
be adjusted without touching git.

The preview container also writes `public/config.js` at startup, matching the
runtime config behavior of the production image.

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Your backend API URL | `http://localhost:8080` or `https://api.example.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MAPBOX_ACCESS_TOKEN` | Mapbox token for maps (get from [mapbox.com](https://www.mapbox.com/)) | Empty (maps disabled) |

## How Runtime Configuration Works

### Build Time (GitHub Container Registry / GitHub Actions)

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
# ... install dependencies and build
RUN npm run build

FROM node:20-alpine
# ... copy built files only
```

### Runtime (Container Start)

When container starts, `entrypoint.sh` generates `public/config.js`:

```bash
#!/bin/sh
cat > public/config.js << EOF
window.__RUNTIME_CONFIG__ = {
  API_URL: "${NEXT_PUBLIC_API_URL:-http://localhost:8080}",
  MAPBOX_ACCESS_TOKEN: "${MAPBOX_ACCESS_TOKEN:-}"
};
EOF
npm start
```

### Client-Side Usage

```typescript
import { getApiUrl, getMapboxToken } from '../utils/runtimeConfig';

const apiUrl = getApiUrl(); // Reads from window.__RUNTIME_CONFIG__
const mapboxToken = getMapboxToken();
```

## Building Locally

If you want to build the image yourself instead of pulling from GHCR:

```bash
docker build -t batchvault-front:local .
```

With custom build arguments:

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg MAPBOX_ACCESS_TOKEN=your_token \
  -t batchvault-front:local .
```

## Development vs Production

### Development (with local backend)

```yaml
environment:
  NEXT_PUBLIC_API_URL: 'http://localhost:8080'
  MAPBOX_ACCESS_TOKEN: 'pk.your_dev_token'
```

### Production (with remote backend)

```yaml
environment:
  NEXT_PUBLIC_API_URL: 'https://api.yourdomain.com'
  MAPBOX_ACCESS_TOKEN: 'pk.your_prod_token'
```

## Security Best Practices

1. **Never commit secrets to git** - Use environment variables in docker-compose.yaml
2. **Use separate tokens for dev/prod** - Mapbox allows multiple tokens
3. **Don't expose .env files** - docker-compose.yaml is sufficient
4. **Keep images updated** - Pull latest version regularly

## Troubleshooting

### Container exits immediately

Check logs:
```bash
docker-compose logs jerky_vault_frontend
```

### API requests failing

1. Verify `NEXT_PUBLIC_API_URL` is correct
2. Check backend is accessible from container
3. Check browser console for CORS errors

### Maps not showing

1. Verify `MAPBOX_ACCESS_TOKEN` is valid
2. Check token has correct permissions
3. Check browser console for Mapbox errors

### Runtime config not loading

1. Check that `public/config.js` is being generated (view container logs)
2. Verify script is loading in browser (Network tab in DevTools)
3. Check `window.__RUNTIME_CONFIG__` in browser console

## Performance Benefits

### Before (Old Approach)
```bash
docker run → npm install (30s) → npm run build (60s) → npm start
Total: ~90 seconds
```

### After (New Approach)
```bash
docker build (one-time) → docker run → npm start (2s)
Total: ~2 seconds
```

## GitHub Actions CI/CD

The `.github/workflows/main.yml` workflow automatically:

1. Builds image on push to `main` branch
2. Pushes to GitHub Container Registry with default values
3. Uses GitHub Actions cache for faster builds

## Support

For issues or questions:
- [GitHub Issues](https://github.com/dzarlax/jerky-vault/issues)
- [Documentation](./README.md)
