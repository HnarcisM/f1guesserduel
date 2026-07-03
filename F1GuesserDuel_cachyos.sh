#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_VERSION="cachyos-launcher-v2-auto-nvm"
APP_NAME="F1 Guesser Duel - Server"
REQUIRED_NODE_MAJOR="${REQUIRED_NODE_MAJOR:-22}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() { printf '\n[INFO] %s\n' "$1"; }
warn() { printf '\n[WARN] %s\n' "$1"; }
fail() { printf '\n[ERROR] %s\n' "$1" >&2; exit 1; }

has_required_dependencies() {
  node -e "require.resolve('express'); require.resolve('socket.io'); require.resolve('better-sqlite3'); require.resolve('cookie-parser');" >/dev/null 2>&1
}

show_arch_setup_hint() {
  cat <<'EOF'

Pași manuali dacă scriptul nu poate activa automat Node 22:

  sudo pacman -Syu --needed nvm python base-devel

  mkdir -p ~/.nvm
  source /usr/share/nvm/init-nvm.sh

  nvm install 22
  nvm use 22
  nvm alias default 22

  node -v

Dacă node -v afișează v22.x.x:
  rm -rf node_modules
  ./F1GuesserDuel_cachyos.sh

Pentru activare permanentă în bash:
  grep -qxF 'source /usr/share/nvm/init-nvm.sh' ~/.bashrc || echo 'source /usr/share/nvm/init-nvm.sh' >> ~/.bashrc

Pentru activare permanentă în zsh:
  grep -qxF 'source /usr/share/nvm/init-nvm.sh' ~/.zshrc || echo 'source /usr/share/nvm/init-nvm.sh' >> ~/.zshrc
EOF
}

install_nvm_if_missing() {
  if [[ -s "/usr/share/nvm/init-nvm.sh" || -s "$HOME/.nvm/nvm.sh" ]]; then
    return 0
  fi

  warn "NVM nu pare instalat. Încerc instalarea prin pacman..."
  if ! command -v pacman >/dev/null 2>&1; then
    warn "pacman nu este disponibil. Nu pot instala automat NVM."
    return 1
  fi

  sudo pacman -Syu --needed nvm python base-devel
}

load_nvm_if_available() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  mkdir -p "$NVM_DIR"

  if [[ -s "/usr/share/nvm/init-nvm.sh" ]]; then
    # Arch/CachyOS nvm package
    # shellcheck source=/dev/null
    source "/usr/share/nvm/init-nvm.sh"
    return 0
  fi

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # Official nvm install location
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    return 0
  fi

  return 1
}

current_node_major() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || true
}

ensure_node_22() {
  log "Verific Node.js pentru proiect..."

  if command -v node >/dev/null 2>&1; then
    printf 'Node detectat înainte de NVM: '
    node -v || true
    printf 'Cale node înainte de NVM: '
    command -v node || true
  else
    warn "Node.js nu este disponibil înainte de NVM."
  fi

  install_nvm_if_missing || true

  if ! load_nvm_if_available; then
    show_arch_setup_hint
    fail "Nu pot încărca NVM. Lipsește /usr/share/nvm/init-nvm.sh sau ~/.nvm/nvm.sh."
  fi

  if ! type nvm >/dev/null 2>&1; then
    show_arch_setup_hint
    fail "NVM a fost încărcat aparent, dar comanda nvm nu este disponibilă."
  fi

  log "NVM este disponibil. Instalez/activez Node.js $REQUIRED_NODE_MAJOR..."
  nvm install "$REQUIRED_NODE_MAJOR"
  nvm use "$REQUIRED_NODE_MAJOR"
  nvm alias default "$REQUIRED_NODE_MAJOR" >/dev/null 2>&1 || true

  # Curăță cache-ul shell-ului, ca să nu rămână /usr/bin/node.
  hash -r 2>/dev/null || true

  if ! command -v node >/dev/null 2>&1; then
    show_arch_setup_hint
    fail "După nvm use $REQUIRED_NODE_MAJOR, comanda node nu este disponibilă."
  fi

  local node_major
  node_major="$(current_node_major)"

  log "Node activ după NVM:"
  node -v
  printf 'Cale node după NVM: '
  command -v node

  if [[ "$node_major" != "$REQUIRED_NODE_MAJOR" ]]; then
    show_arch_setup_hint
    fail "Versiune Node incompatibilă: ai Node.js major $node_major, dar proiectul cere Node.js $REQUIRED_NODE_MAJOR.x."
  fi

  log "Node.js $REQUIRED_NODE_MAJOR.x este activ corect."
}

log "Pornire $APP_NAME pe CachyOS / Arch Linux..."
printf 'Script version: %s\n' "$SCRIPT_VERSION"
printf 'Folder proiect: %s\n' "$SCRIPT_DIR"
printf 'Acest script activează Node.js 22 prin NVM, verifică dependențele serverului și pornește aplicația local.\n'

[[ -f "package.json" ]] || fail "Nu găsesc package.json. Rulează scriptul din folderul proiectului."
[[ -f "server/index.js" ]] || fail "Nu găsesc server/index.js. Repository-ul pare incomplet."

ensure_node_22

command -v npm >/dev/null 2>&1 || { show_arch_setup_hint; fail "npm nu este disponibil după activarea Node.js $REQUIRED_NODE_MAJOR."; }

log "Versiuni active finale:"
node -v
npm -v

SERVER_PORT="${PORT:-3000}"
if ! [[ "$SERVER_PORT" =~ ^[0-9]+$ ]] || (( SERVER_PORT < 1 || SERVER_PORT > 65535 )); then
  fail "PORT invalid: $SERVER_PORT. Folosește o valoare între 1 și 65535."
fi

log "[1/4] Verific dependențele npm pentru server..."
if has_required_dependencies; then
  printf 'Dependențe npm OK. Sar peste instalare.\n'
else
  warn "Dependențele lipsesc sau sunt incomplete. Curăț node_modules și reinstalez corect cu Node.js $REQUIRED_NODE_MAJOR..."
  rm -rf node_modules

  if [[ -f "package-lock.json" ]]; then
    if ! npm ci --omit=dev; then
      warn "npm ci --omit=dev a eșuat. Încerc npm install --omit=dev o singură dată..."
      rm -rf node_modules
      npm install --omit=dev || { show_arch_setup_hint; fail "Nu am putut instala dependențele npm."; }
    fi
  else
    npm install --omit=dev || { show_arch_setup_hint; fail "Nu am putut instala dependențele npm."; }
  fi
fi

log "[2/4] Confirm că modulele serverului pot fi încărcate..."
has_required_dependencies || { show_arch_setup_hint; fail "Dependențele au fost instalate, dar serverul nu le poate încărca." ; }
printf 'Module server OK.\n'

log "[3/4] Verific dacă portul $SERVER_PORT este liber..."
if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$SERVER_PORT" | grep -q LISTEN; then
  warn "Portul $SERVER_PORT este deja ocupat. Serverul poate eșua la pornire."
  ss -ltnp "sport = :$SERVER_PORT" || true
  printf 'Poți schimba portul cu, de exemplu: PORT=3001 ./F1GuesserDuel_cachyos.sh\n'
fi

log "[4/4] Pornesc serverul..."
printf 'Aplicația va fi disponibilă de obicei la: http://localhost:%s\n\n' "$SERVER_PORT"
exec npm start
