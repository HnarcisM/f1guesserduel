import { showErrorToast } from './toastController.js';

const DEFAULT_DUEL_LEVEL = 'easy';

let selectedDuelLevel = DEFAULT_DUEL_LEVEL;
let selectPlayerHandler = null;
let leaveRoomHandler = null;
let settingsChangeHandler = null;
let timerController = null;
let latestRoomState = null;

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
    return member.role === 'spectator' ? 'În lobby ca spectator' : 'În lobby';
}

function getLobbyPermissions(roomState = {}) {
    const you = roomState.you || {};
    const isHost = Boolean(you.isHost);
    const isSpectator = you.role === 'spectator';
    const isPlaying = roomState.roundState === 'playing';

    return {
        isHost,
        isSpectator,
        isPlaying,
        canInteract: isHost && !isSpectator && !isPlaying
    };
}

function createSelectPlayerButton(member, canInteract) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'duel-lobby-select-player-btn';
    button.textContent = 'Alege ca Player 2';
    button.disabled = !canInteract || !member?.lobbyId || member.connected === false;
    button.setAttribute('aria-disabled', String(button.disabled));

    button.addEventListener('click', () => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
            showErrorToast('Doar hostul poate schimba jucătorii din lobby.');
            return;
        }

        const confirmed = window.confirm('Schimbi Player 2 cu spectatorul selectat? Scorul camerei se va reseta la 0 - 0.');
        if (!confirmed) return;

        selectPlayerHandler?.(member.lobbyId);
    });

    return button;
}

function createMemberCard(member, label, options = {}) {
    const card = document.createElement('article');
    card.className = 'duel-lobby-member-card';
    if (!member) card.classList.add('empty');
    if (member?.isYou) card.classList.add('is-you');
    if (member?.isHost) card.classList.add('is-host');
    if (member?.role === 'spectator') card.classList.add('is-spectator');

    const title = createTextElement('span', 'duel-lobby-member-label', label);
    const name = createTextElement('strong', 'duel-lobby-member-name', member?.username || 'Așteaptă jucător');
    const status = createTextElement('span', 'duel-lobby-member-status', getStatusLabel(member));

    const badges = document.createElement('div');
    badges.className = 'duel-lobby-member-badges';
    if (member?.isHost) badges.appendChild(createTextElement('span', 'duel-lobby-badge host', 'Host'));
    if (member?.isYou) badges.appendChild(createTextElement('span', 'duel-lobby-badge you', 'Tu'));
    if (member?.role === 'spectator') badges.appendChild(createTextElement('span', 'duel-lobby-badge spectator', 'Spectator'));

    card.append(title, name, status, badges);

    if (options.showSelectAction && member) {
        card.appendChild(createSelectPlayerButton(member, Boolean(options.canInteract)));
    }

    return card;
}

function setControlsDisabled(selector, disabled) {
    document.querySelectorAll(selector).forEach(control => {
        control.classList.toggle('is-locked', disabled);
        control.setAttribute('aria-disabled', String(disabled));
        if ('disabled' in control) control.disabled = disabled;
    });
}

function getLobbySettings(roomState = latestRoomState || {}) {
    const settings = roomState?.lobbySettings || {};
    return {
        difficulty: settings.difficulty || roomState?.difficulty || selectedDuelLevel || DEFAULT_DUEL_LEVEL,
        timed: settings.timed === true,
        timeLimitSeconds: settings.timeLimitSeconds || roomState?.timeLimitSeconds || timerController?.getSelectedTimeLimitSeconds?.() || 60
    };
}

function emitLobbySettingsChange() {
    if (typeof settingsChangeHandler !== 'function') return;

    settingsChangeHandler({
        level: selectedDuelLevel || DEFAULT_DUEL_LEVEL,
        timed: Boolean(timerController?.isTimedModeEnabled?.()),
        timeLimitSeconds: timerController?.getSelectedTimeLimitSeconds?.() || 60
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
            : 'Hostul poate configura, schimba Player 2 și porni următoarea rundă din lobby.';
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
    const permissions = getLobbyPermissions(roomState);

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
                spectatorsEl.appendChild(createMemberCard(spectator, `Spectator ${index + 1}`, {
                    showSelectAction: true,
                    canInteract: permissions.canInteract
                }));
            });
        }
    }
}

function syncLobbyTimerButtons(roomState = {}) {
    const settings = getLobbySettings(roomState);

    document.querySelectorAll('#duelLobbyPanel [data-timer-mode]').forEach(button => {
        const value = button.dataset.timerMode;
        const isActive = value === 'off'
            ? !settings.timed
            : settings.timed && Number(value) === Number(settings.timeLimitSeconds);

        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function renderSettingsState(roomState = {}) {
    const { isHost, isSpectator, isPlaying, canInteract } = getLobbyPermissions(roomState);
    const hint = document.getElementById('duelLobbySettingsHint');
    const startButton = document.getElementById('duelLobbyStartBtn');

    setControlsDisabled('[data-duel-lobby-level]', !canInteract);
    setControlsDisabled('#duelLobbyPanel [data-timer-mode]', !canInteract);
    setControlsDisabled('.duel-lobby-select-player-btn', !canInteract);

    if (startButton) {
        startButton.disabled = !canInteract;
        startButton.classList.toggle('is-locked', !canInteract);
    }

    if (hint) {
        if (isSpectator) {
            hint.textContent = 'Ești spectator. Poți urmări lobby-ul, dar nu poți modifica setările sau jucătorii.';
        } else if (!isHost) {
            hint.textContent = 'Doar hostul poate modifica setările, schimba Player 2 și porni runda.';
        } else if (isPlaying) {
            hint.textContent = 'Setările și jucătorii sunt blocați cât timp runda este activă.';
        } else {
            hint.textContent = 'Hostul poate schimba setările și poate alege un spectator ca Player 2. Schimbarea jucătorului resetează scorul.';
        }
    }

    syncLevelButtons();
    syncLobbyTimerButtons(roomState);
}

export function createDuelLobbyLeaveClickHandler(onLeaveRoom) {
    const handler = typeof onLeaveRoom === 'function' ? onLeaveRoom : null;
    return () => {
        handler?.();
    };
}

export function setupDuelLobbyView({ onStartRound, onSelectPlayer, onLeaveRoom, onSettingsChange, timer } = {}) {
    selectPlayerHandler = typeof onSelectPlayer === 'function' ? onSelectPlayer : null;
    leaveRoomHandler = typeof onLeaveRoom === 'function' ? onLeaveRoom : null;
    settingsChangeHandler = typeof onSettingsChange === 'function' ? onSettingsChange : null;
    timerController = timer || null;
    syncLevelButtons();

    document.querySelectorAll('[data-duel-lobby-level]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
                showErrorToast('Doar hostul poate modifica setările din lobby.');
                return;
            }
            selectedDuelLevel = button.dataset.duelLobbyLevel || DEFAULT_DUEL_LEVEL;
            syncLevelButtons();
            emitLobbySettingsChange();
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
            syncLobbyTimerButtons({
                lobbySettings: {
                    difficulty: selectedDuelLevel,
                    timed: value !== 'off',
                    timeLimitSeconds: value === 'off' ? timer?.getSelectedTimeLimitSeconds?.() : Number(value)
                }
            });
            emitLobbySettingsChange();
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

    const leaveButton = document.getElementById('duelLobbyLeaveBtn');
    if (leaveButton) {
        leaveButton.addEventListener('click', createDuelLobbyLeaveClickHandler(leaveRoomHandler));
    }
}

export function renderDuelLobby(roomState = {}, options = {}) {
    const panel = getLobbyPanel();
    if (!panel) return;

    latestRoomState = roomState && typeof roomState === 'object' ? roomState : null;

    const lobbySettings = getLobbySettings(roomState);
    selectedDuelLevel = lobbySettings.difficulty || DEFAULT_DUEL_LEVEL;
    if (roomState.roundState !== 'playing') {
        timerController?.applySelectedTimerSettings?.(lobbySettings.timed, lobbySettings.timeLimitSeconds, { persist: false });
    }

    const shouldShow = Boolean(options.forceVisible) || roomState.roundState !== 'playing';
    setHidden(panel, !shouldShow);
    panel.classList.toggle('is-playing', roomState.roundState === 'playing');

    if (!shouldShow) return;

    updateLobbyMeta(roomState);
    renderMembers(roomState);
    renderSettingsState(roomState);
}

export function resetDuelLobby() {
    latestRoomState = null;
    setHidden(getLobbyPanel(), true);
}

export function getSelectedDuelLevel() {
    return selectedDuelLevel;
}

export function getLatestDuelLobbyState() {
    return latestRoomState;
}
