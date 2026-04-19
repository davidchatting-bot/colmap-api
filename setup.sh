#!/usr/bin/env bash
# Run as root on a fresh Ubuntu 22.04/24.04 DigitalOcean droplet

set -euo pipefail

# apt-get update can fail due to third-party repos with bad/expired keys
# (e.g. Caddy's repo). Update best-effort, then install what we need.
apt_update() {
  echo "==> Updating package lists..."
  apt-get update -qq 2>&1 | grep -v "^W:\|^N:\|^E: The repository" || true
  # If there are broken repos, apt-get install can still succeed for
  # packages available in the main/universe repos — so we continue.
}

if command -v colmap &>/dev/null; then
  echo "==> COLMAP already installed ($(colmap -h 2>&1 | head -1))"
else
  echo "==> Installing COLMAP..."
  add-apt-repository -y universe &>/dev/null
  apt_update
  apt-get install -y colmap
  echo "==> COLMAP installed: $(colmap -h 2>&1 | head -1)"
fi

if command -v node &>/dev/null; then
  echo "==> Node.js already installed ($(node --version))"
else
  echo "==> Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo ""
echo "==> All done"
colmap -h 2>&1 | head -1
echo "Node $(node --version)"
echo ""
echo "Next steps:"
echo "  git clone https://github.com/davidchatting-bot/colmap-api.git"
echo "  cd colmap-api && npm install && node server.js"
