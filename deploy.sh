#!/usr/bin/env bash
# Bygger Traveldays og deployer til Domeneshop (~/travels) over SSH.
# Bevarer alltid ~/travels_private (config + krypterte bilder) – den ligger utenfor webroten og røres aldri.
set -euo pipefail
cd "$(dirname "$0")"

HOST="mollan-olafsenfr@login.domeneshop.no"
KEY="$HOME/.ssh/id_ed25519_domeneshop"
REMOTE_DIR="travels"

echo "▶ Bygger …"
npm run build

echo "▶ Pakker dist …"
tar -C dist -czf site.tgz .

echo "▶ Laster opp …"
scp -q -i "$KEY" site.tgz "$HOST:~/site-travels.tgz"

echo "▶ Pakker ut på serveren …"
ssh -i "$KEY" "$HOST" "mkdir -p ~/$REMOTE_DIR && rm -rf ~/$REMOTE_DIR/assets && tar -C ~/$REMOTE_DIR -xzf ~/site-travels.tgz && rm ~/site-travels.tgz && chmod 600 ~/$REMOTE_DIR/.user.ini 2>/dev/null; ls ~/$REMOTE_DIR | head -20"

rm -f site.tgz
echo "✔ Deployet til ~/$REMOTE_DIR"
