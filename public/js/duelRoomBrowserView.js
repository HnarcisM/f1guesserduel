import { showErrorToast } from './toastController.js';

let createRoomHandler = null;
let joinRoomHandler = null;
let refreshRoomsHandler = null;
let latestRooms = [];

function getPanel() {
    return document.getElementById('duelRoomBrowserPanel');
}

function getList() {
    return document.getElementById('duelRoomList');
}

function getEmptyState() {
    return document.getElementById('duelRoomBrowserEmpty');
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

function getDifficultyLabel(room = {}) {
    const difficulty = room.lobbySettings?.difficulty || 'easy';
    if (difficulty === 'hard') return 'Hard';
    if (difficulty === 'medium') return 'Medium';
    return 'Easy';
}

function getTimerLabel(room = {}) {
    const settings = room.lobbySettings || {};
    return settings.timed ? `${settings.timeLimitSeconds || 60}s` : 'Fără timp';
}

function createRoomCard(room = {}) {
    const card = document.createElement('article');
    card.className = 'duel-room-card';
    card.dataset.roomId = room.roomId || '';
    if (room.roundState === 'playing') card.classList.add('is-playing');
    if (room.canJoinAsPlayer) card.classList.add('has-player-slot');

    const header = document.createElement('div');
    header.className = 'duel-room-card-header';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'duel-room-card-title-block';
    titleBlock.append(
        createTextElement('span', 'duel-room-card-eyebrow', room.statusLabel || 'Lobby'),
        createTextElement('strong', 'duel-room-card-title', `Camera ${room.roomId || '--'}`),
        createTextElement('small', 'duel-room-card-host', `Host: ${room.hostUsername || 'necunoscut'}`)
    );

    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'duel-room-join-btn';
    actionButton.textContent = room.canJoinAsPlayer ? 'Intră în cameră' : 'Intră ca spectator';
    actionButton.addEventListener('click', () => {
        if (!room.roomId) {
            showErrorToast('Camera selectată nu este validă.');
            return;
        }
        joinRoomHandler?.(room.roomId);
    });

    header.append(titleBlock, actionButton);

    const meta = document.createElement('div');
    meta.className = 'duel-room-card-meta';
    meta.append(
        createTextElement('span', '', `Jucători ${room.playerCount || 0}/${room.maxPlayers || 2}`),
        createTextElement('span', '', `Spectatori ${room.spectatorCount || 0}`),
        createTextElement('span', '', getDifficultyLabel(room)),
        createTextElement('span', '', getTimerLabel(room))
    );

    card.append(header, meta);
    return card;
}

function renderRooms(rooms = latestRooms) {
    const list = getList();
    const emptyState = getEmptyState();
    if (!list) return;

    latestRooms = Array.isArray(rooms) ? rooms : [];
    list.replaceChildren();

    const hasRooms = latestRooms.length > 0;
    setHidden(emptyState, hasRooms);

    if (!hasRooms) return;

    for (const room of latestRooms) {
        list.appendChild(createRoomCard(room));
    }
}

export function setupDuelRoomBrowserView({ onCreateRoom, onJoinRoom, onRefreshRooms } = {}) {
    createRoomHandler = typeof onCreateRoom === 'function' ? onCreateRoom : null;
    joinRoomHandler = typeof onJoinRoom === 'function' ? onJoinRoom : null;
    refreshRoomsHandler = typeof onRefreshRooms === 'function' ? onRefreshRooms : null;

    const createButton = document.getElementById('duelCreateRoomBtn');
    if (createButton) {
        createButton.addEventListener('click', () => createRoomHandler?.());
    }

    const refreshButton = document.getElementById('duelRefreshRoomsBtn');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => refreshRoomsHandler?.());
    }

    renderRooms([]);
}

export function setDuelRoomBrowserVisible(isVisible) {
    setHidden(getPanel(), !isVisible);
    if (isVisible) refreshRoomsHandler?.();
}

export function renderDuelRoomBrowser(payload = {}) {
    const rooms = Array.isArray(payload) ? payload : payload.rooms;
    renderRooms(Array.isArray(rooms) ? rooms : []);
}

export function resetDuelRoomBrowser() {
    latestRooms = [];
    renderRooms([]);
    setDuelRoomBrowserVisible(false);
}
