import { showErrorToast } from './toastController.js';

const DEFAULT_DUEL_LEVEL = 'easy';

let selectedDuelLevel = DEFAULT_DUEL_LEVEL;

function getLobbyPanel() {
    return document.getElementById('duelLobbyPanel');
}

function setHidden(element, isHidden) {
    if (!element) return;
    element.classList.toggle('is-hidden', Boolean(isHidden));
    element.setAttribute('aria-hidden', String(Boolean(isHidden)));
}

function createTextElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
}

function getStatusLabel(member) {
    if (!member) return 'Slot liber';
    if (member.connected === false) return 'Deconectat';
    if (member.finished) return member.timedOut ? 'Timp expirat' : 'Terminat';
    return 'În lobby';
}

function createMemberCard(member, label) {
    const card = document.createElement('article');
    card.className = 'duel-lobby-member-card';
    if (!member) card.classList.add('empty');
    if (member?.isYou) card.classList.add('is-you');
    if (member?.isHost) card.classList.add('is-host');

    const title = createTextElement('span', 'duel-lobby-member-label', label);
    const name = createTextElement('strong', 'duel-lobby-member-name', member?.username || 'Așteaptă jucător');
    const status = createTextElement('span', 'duel-lobby-member-status', getStatusLabel(member));

    const badges = document.createElement('div');
    badges.className = 'duel-lobby-member-badges';
    if (member?.isHost) badges.appendChild(createTextElement('span', 'duel-lobby-badge host', 'Host'));
    if (member?.isYou) badges.appendChild(createTextElement('span', 'duel-lobby-badge you', 'Tu'));

    card.append(title, name, status, badges);
    return card;
}

function setControlsDisabled(selector, disabled) {
    document.querySelectorAll(selector).forEach(control => {
        control.classList.toggle('is-locked', disabled);
        control.setAttribute('aria-disabled', String(disabled));
        if ('disabled' in control) control.disabled = disabled;
    });
}

function syncLevelButtons() {
    document.querySelectorAll('[data-duel-lobby-level]').forEach(button => {
        const isActive = button.dataset.duelLobbyLevel === selectedDuelLevel;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function updateLobbyMeta(roomState = {}) {
    const title = document.getElementById('duelLobbyTitle');
    const subtitle = document.getElementById('duelLobbySubtitle');
    const roomCode = document.getElementById('duelLobbyRoomCode');

    const players = Array.isArray(roomState.players) ? roomState.players : [];
    const spectators = Array.isArray(roomState.spectators) ? roomState.spectators : [];
    const host = players.find(player => player.isHost);

    if (title) title.textContent = 'Lobby Duel';
    if (subtitle) {
        subtitle.textContent = roomState.roundState === 'playing'
            ? 'Runda este în desfășurare. Setările sunt blocate până la final.'
            : 'Hostul poate configura și porni următoarea rundă din lobby.';
    }
    if (roomCode) {
        const roomId = roomState.roomId || new URLSearchParams(window.location.search).get('room') || '--';
        const hostName = host?.username || 'necunoscut';
        roomCode.textContent = `Camera ${roomId} · Host: ${hostName} · Spectatori: ${spectators.length}`;
    }
}

function renderMembers(roomState = {}) {
    const membersEl = document.getElementById('duelLobbyMembers');
    const spectatorsEl = document.getElementById('duelLobbySpectators');
    if (!membersEl) return;

    const players = Array.isArray(roomState.players) ? roomState.players : [];
    const spectators = Array.isArray(roomState.spectators) ? roomState.spectators : [];

    membersEl.replaceChildren(
        createMemberCard(players[0], 'Player 1'),
        createMemberCard(players[1], 'Player 2')
    );

    if (spectatorsEl) {
        spectatorsEl.replaceChildren();
        if (spectators.length === 0) {
            spectatorsEl.appendChild(createTextElement('p', 'duel-lobby-empty', 'Nu există spectatori în lobby.'));
        } else {
            spectators.forEach((spectator, index) => {
                spectatorsEl.appendChild(createMemberCard(spectator, `Spectator ${index + 1}`));
            });
        }
    }
}

function renderSettingsState(roomState = {}) {
    const you = roomState.you || {};
    const isHost = Boolean(you.isHost);
    const isSpectator = you.role === 'spectator';
    const isPlaying = roomState.roundState === 'playing';
    const canInteract = isHost && !isSpectator && !isPlaying;
    const hint = document.getElementById('duelLobbySettingsHint');
    const startButton = document.getElementById('duelLobbyStartBtn');

    setControlsDisabled('[data-duel-lobby-level]', !canInteract);
    setControlsDisabled('#duelLobbyPanel [data-timer-mode]', !canInteract);

    if (startButton) {
        startButton.disabled = !canInteract;
        startButton.classList.toggle('is-locked', !canInteract);
    }

    if (hint) {
        if (isSpectator) {
            hint.textContent = 'Ești spectator. Poți urmări lobby-ul, dar nu poți modifica setările.';
        } else if (!isHost) {
            hint.textContent = 'Doar hostul poate modifica setările și porni runda.';
        } else if (isPlaying) {
            hint.textContent = 'Setările sunt blocate cât timp runda este activă.';
        } else {
            hint.textContent = 'Setările din lobby se aplică la următoarea rundă de Duel.';
        }
    }

    syncLevelButtons();
}

export function setupDuelLobbyView({ onStartRound, timer } = {}) {
    syncLevelButtons();

    document.querySelectorAll('[data-duel-lobby-level]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
                showErrorToast('Doar hostul poate modifica setările din lobby.');
                return;
            }
            selectedDuelLevel = button.dataset.duelLobbyLevel || DEFAULT_DUEL_LEVEL;
            syncLevelButtons();
        });
    });

    document.querySelectorAll('#duelLobbyPanel [data-timer-mode]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
                showErrorToast('Doar hostul poate modifica timerul din lobby.');
                return;
            }
            const value = button.dataset.timerMode;
            timer?.setTimedMode?.(value !== 'off', value);
        });
    });

    const startButton = document.getElementById('duelLobbyStartBtn');
    if (startButton) {
        startButton.addEventListener('click', () => {
            if (startButton.disabled || startButton.getAttribute('aria-disabled') === 'true') {
                showErrorToast('Doar hostul poate porni runda din lobby.');
                return;
            }
            onStartRound?.(selectedDuelLevel);
        });
    }
}

export function renderDuelLobby(roomState = {}, options = {}) {
    const panel = getLobbyPanel();
    if (!panel) return;

    const shouldShow = Boolean(options.forceVisible) || roomState.roundState !== 'playing';
    setHidden(panel, !shouldShow);
    panel.classList.toggle('is-playing', roomState.roundState === 'playing');

    if (!shouldShow) return;

    updateLobbyMeta(roomState);
    renderMembers(roomState);
    renderSettingsState(roomState);
}

export function resetDuelLobby() {
    setHidden(getLobbyPanel(), true);
}

export function getSelectedDuelLevel() {
    return selectedDuelLevel;
}
