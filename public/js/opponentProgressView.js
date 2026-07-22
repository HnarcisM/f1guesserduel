import { setProgressPercent } from './progressStyle.js';

const MAX_ATTEMPTS = 6;
let countdownInterval = null;
let lastTimedState = null;

function getPanel() {
    return document.getElementById('opponentProgressPanel');
}

function getContent() {
    return document.getElementById('opponentProgressContent');
}

function clearTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    lastTimedState = null;
}

function clearNode(node) {
    if (node) node.replaceChildren();
}

function createTextElement(tagName, className, text) {
    const el = document.createElement(tagName);
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

function getRemainingSeconds(roomState = {}) {
    if (!roomState.timed || !roomState.timeLimitSeconds || !roomState.roundStartedAt) return null;
    const endsAt = Number(roomState.roundStartedAt) + Number(roomState.timeLimitSeconds) * 1000;
    if (!Number.isFinite(endsAt)) return null;
    return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

function formatRemainingTime(seconds) {
    if (seconds === null || seconds === undefined) return 'Fără limită de timp';
    if (seconds <= 0) return '0s';
    return `${seconds}s`;
}

function updateTimerText() {
    const timerEl = document.getElementById('opponentProgressTime');
    if (!timerEl || !lastTimedState) return;
    timerEl.textContent = formatRemainingTime(getRemainingSeconds(lastTimedState));
}

function buildOpponentStatus(opponent) {
    if (!opponent) return 'Așteaptă adversarul';
    if (opponent.timedOut) return 'Timp expirat';
    if (opponent.finished) return 'A terminat';
    return 'Încă joacă';
}

function buildProgressText(opponent) {
    const attempts = Math.max(0, Math.min(MAX_ATTEMPTS, Number(opponent?.attempts) || 0));
    return `${attempts}/${MAX_ATTEMPTS} încercări`;
}

function createOpponentCard(opponent, roomState) {
    const card = document.createElement('article');
    card.className = 'opponent-progress-card';
    if (opponent?.finished) card.classList.add('is-finished');
    if (opponent?.timedOut) card.classList.add('is-timed-out');

    const header = document.createElement('div');
    header.className = 'opponent-progress-card-header';
    header.append(
        createTextElement('strong', 'opponent-progress-name', opponent?.username || 'Adversar'),
        createTextElement('span', 'opponent-progress-status', buildOpponentStatus(opponent))
    );

    const attempts = Math.max(0, Math.min(MAX_ATTEMPTS, Number(opponent?.attempts) || 0));
    const progress = document.createElement('div');
    progress.className = 'opponent-progress-meter';
    progress.setAttribute('aria-label', buildProgressText(opponent));

    const fill = document.createElement('span');
    fill.className = 'opponent-progress-meter-fill';
    setProgressPercent(fill, (attempts / MAX_ATTEMPTS) * 100);
    progress.appendChild(fill);

    const meta = document.createElement('div');
    meta.className = 'opponent-progress-meta';
    meta.append(
        createTextElement('span', '', buildProgressText(opponent)),
        createTextElement('span', '', roomState.timed ? 'Timp rămas: ' : 'Timer: ')
    );

    const timeValue = createTextElement('strong', '', formatRemainingTime(getRemainingSeconds(roomState)));
    timeValue.id = 'opponentProgressTime';
    meta.lastChild.appendChild(timeValue);

    card.append(header, progress, meta);
    return card;
}

function shouldShowOpponentProgress(roomState = {}) {
    const you = roomState.you;
    if (!you || !you.finished) return false;
    if (roomState.roundState !== 'playing') return false;
    const opponents = Array.isArray(roomState.players)
        ? roomState.players.filter(player => !player.isYou)
        : [];
    return opponents.some(player => !player.finished);
}

export function renderOpponentProgress(roomState = {}) {
    const panel = getPanel();
    const content = getContent();
    if (!panel || !content) return;

    if (!shouldShowOpponentProgress(roomState)) {
        resetOpponentProgress();
        return;
    }

    const opponents = Array.isArray(roomState.players)
        ? roomState.players.filter(player => !player.isYou)
        : [];
    const activeOpponent = opponents.find(player => !player.finished) || opponents[0] || null;

    clearNode(content);
    content.appendChild(createOpponentCard(activeOpponent, roomState));

    panel.classList.remove('is-hidden');
    panel.setAttribute('aria-hidden', 'false');

    clearTimer();
    if (roomState.timed) {
        lastTimedState = { ...roomState };
        updateTimerText();
        countdownInterval = setInterval(updateTimerText, 1000);
    }
}

export function resetOpponentProgress() {
    clearTimer();
    const panel = getPanel();
    const content = getContent();
    if (content) clearNode(content);
    if (panel) {
        panel.classList.add('is-hidden');
        panel.setAttribute('aria-hidden', 'true');
    }
}
