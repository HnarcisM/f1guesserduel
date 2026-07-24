const DEFAULT_DUEL_AVATAR_KEY = 'helmet-red';
const DEFAULT_DUEL_LEVEL = 1;
const AVATAR_KEYS = new Set([
    'helmet-red',
    'helmet-blue',
    'helmet-yellow',
    'helmet-green',
    'helmet-orange',
    'helmet-purple',
    'helmet-cyan',
    'helmet-white'
]);

function normalizeDuelIdentity(source = {}) {
    const username = typeof source?.username === 'string' && source.username.trim()
        ? source.username.trim().slice(0, 20)
        : 'Guest';
    const avatarKey = AVATAR_KEYS.has(String(source?.avatarKey || '').trim().toLowerCase())
        ? String(source.avatarKey).trim().toLowerCase()
        : DEFAULT_DUEL_AVATAR_KEY;
    const parsedLevel = Number(source?.level);
    const level = Number.isSafeInteger(parsedLevel) && parsedLevel >= 1 && parsedLevel <= 10_000
        ? parsedLevel
        : DEFAULT_DUEL_LEVEL;

    return { username, avatarKey, level };
}

function createAvatar(documentObject, identity) {
    const avatar = documentObject.createElement('span');
    avatar.className = 'auth-avatar-visual duel-identity-avatar';
    avatar.dataset.avatarKey = identity.avatarKey;
    avatar.setAttribute('aria-hidden', 'true');

    const helmet = documentObject.createElement('span');
    helmet.className = 'auth-helmet-icon';
    avatar.append(helmet);
    return avatar;
}

function createLevelBadge(documentObject, identity, className = '') {
    const level = documentObject.createElement('span');
    level.className = `duel-identity-level${className ? ` ${className}` : ''}`;
    level.textContent = `Nivel ${identity.level}`;
    level.dataset.duelLevel = String(identity.level);
    return level;
}

function updateIdentityNodes(profile, identity) {
    const avatar = profile?.querySelector?.('.duel-identity-avatar');
    const level = profile?.querySelector?.('.duel-identity-level');
    if (avatar) avatar.dataset.avatarKey = identity.avatarKey;
    if (level) {
        level.textContent = `Nivel ${identity.level}`;
        level.dataset.duelLevel = String(identity.level);
    }
}

function decorateLobbyCard(documentObject, card, member) {
    if (!card || !member) return false;
    const identity = normalizeDuelIdentity(member);
    const existing = card.querySelector?.('.duel-identity-profile');
    if (existing) {
        updateIdentityNodes(existing, identity);
        return true;
    }

    const name = card.querySelector?.('.duel-lobby-member-name');
    const status = card.querySelector?.('.duel-lobby-member-status');
    if (!name || !status) return false;

    const profile = documentObject.createElement('div');
    profile.className = 'duel-identity-profile duel-identity-profile-lobby';
    const copy = documentObject.createElement('div');
    copy.className = 'duel-identity-copy';
    const meta = documentObject.createElement('div');
    meta.className = 'duel-identity-meta';

    card.insertBefore(profile, name);
    profile.append(createAvatar(documentObject, identity), copy);
    copy.append(name, meta);
    meta.append(status, createLevelBadge(documentObject, identity));
    return true;
}

function decorateScoreEntry(documentObject, row, entry) {
    if (!row || !entry) return false;
    const identity = normalizeDuelIdentity(entry);
    const existing = row.querySelector?.('.duel-identity-profile');
    if (existing) {
        updateIdentityNodes(existing, identity);
        return true;
    }

    const name = row.querySelector?.('.room-score-name');
    if (!name) return false;

    const profile = documentObject.createElement('div');
    profile.className = 'duel-identity-profile duel-identity-profile-score';
    const copy = documentObject.createElement('div');
    copy.className = 'duel-identity-copy';

    row.insertBefore(profile, name);
    profile.append(createAvatar(documentObject, identity), copy);
    copy.append(name, createLevelBadge(documentObject, identity, 'duel-identity-level-score'));
    return true;
}

function decorateLivePlayerCard(documentObject, card, player) {
    if (!card || !player) return false;
    const identity = normalizeDuelIdentity(player);
    const existing = card.querySelector?.('.duel-identity-profile');
    if (existing) {
        updateIdentityNodes(existing, identity);
        return true;
    }

    const header = card.querySelector?.('.live-player-header');
    const name = card.querySelector?.('.live-player-name');
    if (!header || !name) return false;
    const titleWrap = name.parentElement;
    if (!titleWrap) return false;

    const profile = documentObject.createElement('div');
    profile.className = 'duel-identity-profile duel-identity-profile-live';
    header.insertBefore(profile, titleWrap);
    profile.append(createAvatar(documentObject, identity), titleWrap);
    titleWrap.append(createLevelBadge(documentObject, identity, 'duel-identity-level-live'));
    return true;
}

function decorateIndexedCollection(documentObject, containerId, cardSelector, members, decorator) {
    const container = documentObject.getElementById(containerId);
    if (!container || !Array.isArray(members)) return 0;
    const cards = [...container.querySelectorAll(cardSelector)];
    let decorated = 0;
    cards.forEach((card, index) => {
        if (decorator(documentObject, card, members[index])) decorated += 1;
    });
    return decorated;
}

function createDuelIdentityController({ document, schedule = callback => callback() } = {}) {
    if (!document) throw new Error('Duel identity controller requires a document.');
    let socket = null;
    let latestRoomState = null;
    let latestLiveBoard = null;
    let latestScoreboard = null;
    let renderScheduled = false;

    function render({ roomState = latestRoomState, liveBoard = latestLiveBoard, scoreboard = latestScoreboard } = {}) {
        latestRoomState = roomState && typeof roomState === 'object' ? roomState : latestRoomState;
        latestLiveBoard = liveBoard && typeof liveBoard === 'object' ? liveBoard : latestLiveBoard;
        latestScoreboard = Array.isArray(scoreboard)
            ? scoreboard
            : Array.isArray(latestRoomState?.scoreboard) ? latestRoomState.scoreboard : latestScoreboard;

        const players = Array.isArray(latestRoomState?.players) ? latestRoomState.players : [];
        const spectators = Array.isArray(latestRoomState?.spectators) ? latestRoomState.spectators : [];
        const livePlayers = Array.isArray(latestLiveBoard?.players) ? latestLiveBoard.players : [];
        const scores = Array.isArray(latestScoreboard) ? latestScoreboard : [];

        return {
            lobbyPlayers: decorateIndexedCollection(
                document,
                'duelLobbyMembers',
                '.duel-lobby-member-card',
                players,
                decorateLobbyCard
            ),
            lobbySpectators: decorateIndexedCollection(
                document,
                'duelLobbySpectators',
                '.duel-lobby-member-card',
                spectators,
                decorateLobbyCard
            ),
            scoreboard: decorateIndexedCollection(
                document,
                'roomScoreboardPlayers',
                '.room-score-entry',
                scores,
                decorateScoreEntry
            ),
            liveBoard: decorateIndexedCollection(
                document,
                'liveDuelPlayers',
                '.live-player-card',
                livePlayers,
                decorateLivePlayerCard
            )
        };
    }

    function scheduleRender(payload = {}) {
        const roomState = payload.roomState || payload.room || null;
        if (roomState && typeof roomState === 'object') latestRoomState = roomState;
        if (payload.liveBoard && typeof payload.liveBoard === 'object') latestLiveBoard = payload.liveBoard;
        if (Array.isArray(payload.scoreboard)) latestScoreboard = payload.scoreboard;
        else if (Array.isArray(roomState?.scoreboard)) latestScoreboard = roomState.scoreboard;

        if (renderScheduled) return;
        renderScheduled = true;
        schedule(() => {
            renderScheduled = false;
            render();
        });
    }

    function attachSocket(nextSocket) {
        if (!nextSocket || typeof nextSocket.on !== 'function' || nextSocket === socket) return;
        socket = nextSocket;
        socket.on('roomStateUpdate', payload => scheduleRender({
            roomState: payload?.room || payload,
            liveBoard: payload?.liveBoard,
            scoreboard: payload?.room?.scoreboard || payload?.scoreboard
        }));
        socket.on('roundResolved', payload => scheduleRender({
            scoreboard: payload?.scoreboard,
            liveBoard: payload?.liveBoard
        }));
        socket.on('duelAborted', payload => scheduleRender({
            roomState: payload?.room,
            liveBoard: payload?.liveBoard,
            scoreboard: payload?.room?.scoreboard
        }));
        socket.on('initGame', payload => scheduleRender({
            liveBoard: payload?.liveBoard,
            scoreboard: payload?.liveBoard?.scoreboard
        }));
    }

    return {
        attachSocket,
        getLatestRoomState: () => latestRoomState,
        render,
        scheduleRender
    };
}

function install(windowObject) {
    const schedule = typeof windowObject.queueMicrotask === 'function'
        ? windowObject.queueMicrotask.bind(windowObject)
        : callback => Promise.resolve().then(callback);
    const controller = createDuelIdentityController({
        document: windowObject.document,
        schedule
    });

    windowObject.addEventListener('f1:socket-created', event => controller.attachSocket(event.detail?.socket));
    if (windowObject.__f1GameSocket) controller.attachSocket(windowObject.__f1GameSocket);
    windowObject.__f1DuelIdentityController = controller;
    return controller;
}

export {
    AVATAR_KEYS,
    DEFAULT_DUEL_AVATAR_KEY,
    DEFAULT_DUEL_LEVEL,
    createAvatar,
    createDuelIdentityController,
    createLevelBadge,
    decorateLivePlayerCard,
    decorateLobbyCard,
    decorateScoreEntry,
    install,
    normalizeDuelIdentity
};

if (typeof window !== 'undefined' && window.document) install(window);
