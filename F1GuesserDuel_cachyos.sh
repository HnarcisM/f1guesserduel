#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="F1 Guesser Duel"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  printf '\n[INFO] %s\n' "$1"
}

warn() {
  printf '\n[WARN] %s\n' "$1"
}

fail() {
  printf '\n[ERROR] %s\n' "$1" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '\n[ERROR] Scriptul s-a oprit cu codul %s.\n' "$exit_code" >&2
  printf 'Dacă eroarea este de la better-sqlite3/node-gyp, rulează din nou scriptul după instalarea dependențelor.\n' >&2
  printf 'Pentru diagnostic: node -v && npm -v && python --version && gcc --version\n' >&2
}
trap on_error ERR

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<HELP
$APP_NAME - launcher pentru CachyOS / Arch Linux

Utilizare:
  ./F1GuesserDuel_cachyos.sh
  ./F1GuesserDuel_cachyos.sh --update-system

Ce face:
  - verifică pacman, Node.js, npm, Python și uneltele de build C/C++
  - instalează pachetele lipsă cu pacman
  - rulează npm install când node_modules lipsește sau package.json s-a schimbat
  - pornește serverul cu npm start

Opțiuni:
  --update-system   Rulează întâi sudo pacman -Syu pentru actualizarea sistemului.
HELP
  exit 0
fi

log "Pornire $APP_NAME pe CachyOS / Arch Linux..."

if ! command -v pacman >/dev/null 2>&1; then
  fail "Acest script este pentru CachyOS/Arch Linux și are nevoie de pacman."
fi

if [[ "${1:-}" == "--update-system" ]]; then
  log "Actualizez sistemul cu pacman -Syu..."
  sudo pacman -Syu --noconfirm
fi

REQUIRED_PACKAGES=(
  nodejs
  npm
  python
  base-devel
  pkgconf
)

MISSING_PACKAGES=()
for package_name in "${REQUIRED_PACKAGES[@]}"; do
  if ! pacman -Q "$package_name" >/dev/null 2>&1; then
    MISSING_PACKAGES+=("$package_name")
  fi
done

if (( ${#MISSING_PACKAGES[@]} > 0 )); then
  log "Instalez pachetele lipsă: ${MISSING_PACKAGES[*]}"
  sudo pacman -Syu --needed --noconfirm "${MISSING_PACKAGES[@]}"
else
  log "Dependențele de sistem sunt deja instalate."
fi

command -v node >/dev/null 2>&1 || fail "Node.js nu este disponibil după instalare."
command -v npm >/dev/null 2>&1 || fail "npm nu este disponibil după instalare."
command -v python >/dev/null 2>&1 || fail "Python nu este disponibil după instalare."
command -v gcc >/dev/null 2>&1 || fail "gcc nu este disponibil. Verifică pachetul base-devel."
command -v make >/dev/null 2>&1 || fail "make nu este disponibil. Verifică pachetul base-devel."

log "Versiuni detectate:"
node -v
npm -v
python --version
gcc --version | head -n 1

PYTHON_BIN="$(command -v python)"
log "Configurez npm/node-gyp să folosească Python: $PYTHON_BIN"
npm config set python "$PYTHON_BIN" >/dev/null 2>&1 || true

NEED_NPM_INSTALL=0
if [[ ! -d "node_modules" ]]; then
  NEED_NPM_INSTALL=1
elif [[ "package.json" -nt "node_modules" ]]; then
  NEED_NPM_INSTALL=1
elif [[ -f "package-lock.json" && "package-lock.json" -nt "node_modules" ]]; then
  NEED_NPM_INSTALL=1
fi

if (( NEED_NPM_INSTALL == 1 )); then
  log "Instalez dependențele Node.js cu npm install..."
  if ! npm install; then
    warn "npm install a eșuat. Încerc rebuild pentru better-sqlite3 din sursă..."
    npm rebuild better-sqlite3 --build-from-source
    npm install
  fi
else
  log "node_modules există și pare actualizat. Sar peste npm install."
fi

log "Verific rapid sintaxa fișierelor JavaScript principale..."
node --check server.js
if [[ -d server ]]; then
  while IFS= read -r -d '' file; do
    node --check "$file"
  done < <(find server -name '*.js' -print0)
fi
node --check public/game.js
if [[ -d public/js ]]; then
  while IFS= read -r -d '' file; do
    node --check "$file"
  done < <(find public/js -name '*.js' -print0)
fi

log "Pornesc serverul..."
npm start
