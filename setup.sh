#!/usr/bin/env bash
# Run as root on a fresh Ubuntu 22.04/24.04 DigitalOcean droplet

set -euo pipefail

echo "==> Installing COLMAP..."
apt-get update -qq
apt-get install -y colmap

echo "==> Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> Versions"
colmap -h 2>&1 | head -1
node --version
npm --version

echo ""
echo "All done. Clone the repo then:"
echo "  cd colmap-api && npm install && npm start"
