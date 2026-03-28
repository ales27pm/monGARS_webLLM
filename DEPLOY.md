# Deployment Guide

This project builds to static assets that can be hosted from any HTTPS-capable web server or wrapped in Tauri. Follow these steps to create and serve a production bundle.

## Prerequisites

- Node.js 18+ and npm.
- Optional: A reverse proxy such as NGINX for HTTPS hosting.

## Build

```bash
npm install
npm run build
```

The output is written to `dist/` with code-split vendor chunks for efficient caching.

## Preview locally

```bash
npm run preview -- --host --port 4173
```

This starts a local static server against the built assets.

## Deploy on GitHub Pages (recommended)

This repository already includes an Actions workflow at `.github/workflows/static.yml` that builds Vite and publishes `dist/` to GitHub Pages.

1. In GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, select **Source: GitHub Actions**.
3. Push to the `main` branch (or run the workflow manually from the **Actions** tab).
4. Wait for the workflow **Deploy monGARS_webLLM to GitHub Pages** to finish.

Notes:

- The workflow uses `actions/configure-pages` to detect the right base path automatically (`/` for user/org pages, `/<repo>/` for project pages).
- It also creates `dist/404.html` (SPA route fallback) and `dist/.nojekyll` to avoid Jekyll processing.
- If you use a custom domain, add your `CNAME` file in `dist/` during build or configure it in GitHub Pages settings.
- Legacy workflows for Jekyll/external-repo publishing are intentionally disabled to avoid double-deploy conflicts.

## Serve with NGINX (example)

1. Copy the `dist/` directory contents to your web root (e.g., `/var/www/mongars`).
2. Configure an HTTPS server block:

```nginx
server {
  listen 443 ssl;
  server_name mongars.example.com;

  root /var/www/mongars;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

3. Reload NGINX. Static assets will be served with client-side routing handled by Vite.

## Tauri wrapper

- The desktop shell is optional and wraps the same static assets produced by Vite. Generate the icons from their Base64 sources and build the web bundle first:

```bash
npm run tauri:prepare
```

- Package the desktop binary (requires Rust toolchain, Tauri CLI, and platform SDKs such as Xcode on macOS). `tauri:prepare` is idempotent and safe to run before each build:

```bash
cd src-tauri
cargo tauri build
```

- Security posture:
  - CSP is locked to local assets (`default-src 'self'`) with workers and blobs permitted for WebLLM and embeddings.
  - Remote domains are not allowed for IPC (`dangerousRemoteDomainIpcAccess` is empty).
  - Allowlist defaults deny all APIs; add features deliberately if a native capability is needed.

- The packaged app loads `dist/` as its frontend; no additional backend server is required. Icon binaries are generated locally from `src-tauri/icons/icons.base64.json` via `scripts/prepare-icons.mjs` to avoid storing large binaries in git.
