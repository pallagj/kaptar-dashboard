#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "[✓] Pulling latest code..."
git pull --ff-only

echo "[✓] Installing deps..."
pnpm install

echo "[✓] Building frontend..."
pnpm build

echo "[✓] Updating backend Python deps..."
(cd packages/backend && .venv/bin/pip install -q -e .)

echo "[✓] Restarting services..."
sudo systemctl restart kaptar-frontend kaptar-backend

echo "[✓] Done."
