const DUEL_BEST_OF_OPTIONS = Object.freeze([3, 5, 7]);
const DEFAULT_DUEL_BEST_OF = 3;

function normalizeNonNegativeInteger(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeBestOf(value, fallback = DEFAULT_DUEL_BEST_OF) {
    const parsed = Number(value);
    if (DUEL_BEST_OF_OPTIONS.includes(parsed)) return parsed;

    const fallbackParsed = Number(fallback);
    return DUEL_BEST_OF_OPTIONS.includes(fallbackParsed)
        ? fallbackParsed
        : DEFAULT_DUEL_BEST_OF;
}

function buildRoomSeriesMeta(room = {}) {
    const bestOf = normalizeBestOf(room.bestOf, room.lobbySettings?.bestOf);
    const roundsPlayed = normalizeNonNegativeInteger(room.roundsPlayed);
    const progress = Math.min(roundsPlayed, bestOf);
    const progressSuffix = roundsPlayed > bestOf ? '+' : '';
    const score = Array.isArray(room.score) ? room.score : [];

    return {
        bestOf,
        roundsPlayed,
        bestOfLabel: `Best of ${progress}/${bestOf}${progressSuffix}`,
        scoreLabel: `Scor ${normalizeNonNegativeInteger(score[0])}–${normalizeNonNegativeInteger(score[1])}`
    };
}

function createMetaBadge(documentObject, text) {
    const badge = documentObject.createElement('span');
    badge.className = 'duel-room-series-meta';
    badge.textContent = text;
    return badge;
}

function findRoomCard(documentObject, roomId) {
    return Array.from(documentObject.querySelectorAll?.('.duel-room-card') || [])
        .find(card => card?.dataset?.roomId === roomId) || null;
}

function renderRoomSeriesMeta(documentObject, rooms = []) {
    if (!documentObject) return 0;

    let rendered = 0;
    for (const room of Array.isArray(rooms) ? rooms : []) {
        if (!room || typeof room.roomId !== 'string') continue;

        const card = findRoomCard(documentObject, room.roomId);
        const meta = card?.querySelector?.('.duel-room-card-meta');
        if (!meta) continue;

        meta.querySelectorAll?.('.duel-room-series-meta').forEach(element => element.remove());
        const series = buildRoomSeriesMeta(room);
        meta.append(
            createMetaBadge(documentObject, series.bestOfLabel),
            createMetaBadge(documentObject, series.scoreLabel)
        );
        rendered += 1;
    }

    return rendered;
}

function createController({
    document: documentObject,
    schedule = queueMicrotask
} = {}) {
    if (!documentObject) throw new Error('Duel room series controller requires a document.');

    let socket = null;

    function attachSocket(nextSocket) {
        if (!nextSocket || typeof nextSocket.on !== 'function' || nextSocket === socket) return;
        socket = nextSocket;
        socket.on('roomListUpdate', payload => {
            const rooms = Array.isArray(payload) ? payload : payload?.rooms;
            schedule(() => renderRoomSeriesMeta(documentObject, Array.isArray(rooms) ? rooms : []));
        });
    }

    return {
        attachSocket,
        render: rooms => renderRoomSeriesMeta(documentObject, rooms)
    };
}

function install(windowObject) {
    const schedule = typeof windowObject.queueMicrotask === 'function'
        ? windowObject.queueMicrotask.bind(windowObject)
        : callback => Promise.resolve().then(callback);
    const controller = createController({
        document: windowObject.document,
        schedule
    });

    windowObject.addEventListener('f1:socket-created', event => controller.attachSocket(event.detail?.socket));
    if (windowObject.__f1GameSocket) controller.attachSocket(windowObject.__f1GameSocket);
    windowObject.__f1DuelRoomSeriesController = controller;
    return controller;
}

export {
    DEFAULT_DUEL_BEST_OF,
    DUEL_BEST_OF_OPTIONS,
    buildRoomSeriesMeta,
    createController,
    install,
    normalizeBestOf,
    normalizeNonNegativeInteger,
    renderRoomSeriesMeta
};

if (typeof window !== 'undefined' && window.document) install(window);
