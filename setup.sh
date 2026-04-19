#!/usr/bin/env bash
# Run as root on a fresh Ubuntu 22.04/24.04 DigitalOcean droplet

set -euo pipefail

if command -v colmap &>/dev/null; then
  echo "==> COLMAP already installed ($(colmap -h 2>&1 | head -1))"
else
  echo "==> Installing COLMAP..."
  apt-get update -qq
  apt-get install -y colmap
fi

if command -v node &>/dev/null; then
  echo "==> Node.js already installed ($(node --version))"
else
  echo "==> Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Versions"
colmap -h 2>&1 | head -1
node --version
npm --version

echo ""
echo "All done. Clone the repo then:"
echo "  cd colmap-api && npm install && npm start"
