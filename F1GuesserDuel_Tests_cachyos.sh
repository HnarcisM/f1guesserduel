#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="F1 Guesser Duel - Teste"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() { printf '\n[INFO] %s\n' "$1"; }
warn() { printf '\n[WARN] %s\n' "$1"; }
fail() { printf '\n[ERROR] %s\n' "$1" >&2; exit 1; }

has_test_dependencies() {
  node -e "require.resolve('express'); require.resolve('socket.io'); require.resolve('better-sqlite3'); require.resolve('cookie-parser'); require.resolve('playwright');" >/dev/null 2>&1
}

install_test_dependencies() {
  printf 'Dacă apare un warning de tip deprecated, nu este neapărat eroare.\n'

  if [[ -f "package-lock.json" ]]; then
    if node scripts/run-with-progress.js "npm ci pentru testele complete" npm ci --include=dev; then
      return 0
    fi

    warn "npm ci a eșuat. Încerc npm install fără să șterg package-lock.json..."
    rm -rf node_modules
    node scripts/run-with-progress.js "npm install pentru testele complete" npm install --include=dev
    return $?
  fi

  warn "Nu există package-lock.json. Folosesc npm install pentru a genera dependențele."
  node scripts/run-with-progress.js "npm install pentru testele complete" npm install --include=dev
}

log "Pornire $APP_NAME pe CachyOS / Arch Linux..."
printf 'Acest script rulează testele backend și E2E cu browser real.\n'
printf 'Testele E2E pot dura 1-3 minute la prima rulare deoarece verifică Chromium.\n'

command -v node >/dev/null 2>&1 || fail "Node.js nu este disponibil. Rulează mai întâi ./F1GuesserDuel_cachyos.sh."
command -v npm >/dev/null 2>&1 || fail "npm nu este disponibil. Rulează mai întâi ./F1GuesserDuel_cachyos.sh."

log "Versiuni detectate:"
node -v
npm -v

log "[1/5] Verific/instalez dependențele complete pentru teste..."
if has_test_dependencies; then
  printf 'Dependențe npm pentru teste deja instalate. Sar peste instalare.\n'
else
  install_test_dependencies
fi

log "[2/5] Confirm dependențele necesare pentru teste..."
has_test_dependencies || fail "Dependențele au fost instalate, dar testele nu le pot încărca. Încearcă: rm -rf node_modules && npm ci --include=dev"
printf 'Dependențe teste OK.\n'

log "[3/5] Verific/instalez Chromium pentru Playwright..."
printf 'Dacă Chromium lipsește, descărcarea poate dura câteva minute.\n'
F1_STRICT_PLAYWRIGHT_INSTALL=1 node scripts/run-with-progress.js "instalare/verificare Chromium Playwright" npm run e2e:install

log "[4/5] Rulez testele backend..."
node scripts/run-with-progress.js "teste backend" npm test

log "[5/5] Rulez testele E2E cu browser real..."
printf 'Se deschid intern 3 taburi: Player 1, Player 2 și Spectator.\n'
printf 'Vei vedea mesaje [E2E ora] pentru fiecare pas important.\n'
node scripts/run-with-progress.js "teste E2E cu browser real" npm run test:e2e

log "Toate testele au trecut cu succes."
