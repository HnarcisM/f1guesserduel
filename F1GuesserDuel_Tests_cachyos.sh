#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="F1 Guesser Duel - Teste"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() { printf '\n[INFO] %s\n' "$1"; }
warn() { printf '\n[WARN] %s\n' "$1"; }
fail() { printf '\n[ERROR] %s\n' "$1" >&2; exit 1; }

log "Pornire $APP_NAME pe CachyOS / Arch Linux..."

command -v node >/dev/null 2>&1 || fail "Node.js nu este disponibil. Rulează mai întâi ./F1GuesserDuel_cachyos.sh."
command -v npm >/dev/null 2>&1 || fail "npm nu este disponibil. Rulează mai întâi ./F1GuesserDuel_cachyos.sh."

log "Versiuni detectate:"
node -v
npm -v

log "Instalez/verific dependențele complete pentru teste..."
if ! npm install; then
  warn "npm install a eșuat. Încerc reinstall curat o singură dată..."
  rm -rf node_modules package-lock.json
  npm install
fi

log "Verific/instalez Chromium pentru Playwright..."
npm run e2e:install

log "Rulez testele backend + E2E browser..."
npm run test:all

log "Toate testele au trecut cu succes."
