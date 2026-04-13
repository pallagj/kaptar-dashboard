#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# Kaptár Dashboard — Server install script
# Installs Node.js, pnpm, Python, builds the frontend,
# sets up the backend, and configures Caddy for HTTPS.
#
# Usage:
#   ./install-server.sh                        # HTTP on :3003
#   ./install-server.sh kaptar.example.com     # HTTPS via Caddy
#   ./install-server.sh kaptar.78-46-230-35.sslip.io
# ─────────────────────────────────────────────────────────

DOMAIN="${1:-}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT=8001
FRONTEND_PORT=3003
SERVICE_PREFIX=kaptar

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[[ -f /etc/debian_version ]] || warn "Script tested on Debian/Ubuntu — adapt for your OS."

info "Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq curl git python3 python3-pip python3-venv build-essential > /dev/null

if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  info "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - > /dev/null 2>&1
  sudo apt-get install -y -qq nodejs > /dev/null
else
  info "Node.js $(node -v) already installed"
fi

if ! command -v pnpm &> /dev/null; then
  info "Installing pnpm..."
  sudo npm install -g pnpm > /dev/null 2>&1
else
  info "pnpm $(pnpm -v) already installed"
fi

info "Installing JS dependencies & building frontend..."
cd "$APP_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm build
info "Frontend built → $APP_DIR/packages/frontend/dist"

info "Setting up Python backend..."
cd "$APP_DIR/packages/backend"
[[ -d .venv ]] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -e .
info "Backend ready"

info "Installing 'serve' for frontend..."
sudo npm install -g serve > /dev/null 2>&1 || true

info "Creating systemd services..."
sudo tee /etc/systemd/system/${SERVICE_PREFIX}-frontend.service > /dev/null <<EOF
[Unit]
Description=Kaptár Dashboard Frontend
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR/packages/frontend
ExecStart=$(which serve) -s dist -l $FRONTEND_PORT
Restart=always
RestartSec=5
User=$(whoami)
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/${SERVICE_PREFIX}-backend.service > /dev/null <<EOF
[Unit]
Description=Kaptár Dashboard Backend (FastAPI)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR/packages/backend
ExecStart=$APP_DIR/packages/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT
Restart=always
RestartSec=5
User=$(whoami)
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_PREFIX}-frontend ${SERVICE_PREFIX}-backend > /dev/null
sudo systemctl restart ${SERVICE_PREFIX}-frontend ${SERVICE_PREFIX}-backend
info "Services started (frontend :$FRONTEND_PORT, backend :$BACKEND_PORT)"

if [[ -n "$DOMAIN" ]]; then
  if ! command -v caddy &> /dev/null; then
    info "Installing Caddy..."
    sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https > /dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq caddy > /dev/null
  fi

  info "Configuring Caddy for $DOMAIN..."
  CADDY_SNIPPET="/etc/caddy/kaptar.conf"
  sudo tee "$CADDY_SNIPPET" > /dev/null <<EOF
$DOMAIN {
    handle /api/* {
        reverse_proxy localhost:$BACKEND_PORT
    }
    handle {
        reverse_proxy localhost:$FRONTEND_PORT
    }
}
EOF

  if [[ -f /etc/caddy/Caddyfile ]] && ! grep -q "import kaptar.conf" /etc/caddy/Caddyfile; then
    echo "" | sudo tee -a /etc/caddy/Caddyfile > /dev/null
    echo "import kaptar.conf" | sudo tee -a /etc/caddy/Caddyfile > /dev/null
  fi

  sudo systemctl reload caddy
  info "Caddy configured — https://$DOMAIN"
else
  warn "No domain provided. Frontend available at http://<server-ip>:$FRONTEND_PORT (note: PWA install requires HTTPS)"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Kaptár Dashboard — Install complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  Backend:  http://localhost:$BACKEND_PORT/api/health"
[[ -n "$DOMAIN" ]] && echo "  Public:   https://$DOMAIN"
echo ""
echo "  Logs:"
echo "    sudo journalctl -u ${SERVICE_PREFIX}-backend -f"
echo "    sudo journalctl -u ${SERVICE_PREFIX}-frontend -f"
echo ""
