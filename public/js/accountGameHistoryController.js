const HISTORY_LIMIT = 10;

function normalizeText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeGame(game) {
    if (!game || typeof game !== 'object') return null;
    const target = game.targetDriver && typeof game.targetDriver === 'object'
        ? {
            id: normalizeText(game.targetDriver.id),
            name: normalizeText(game.targetDriver.name)
        }
        : null;
    return {
        mode: ['single', 'daily', 'duel'].includes(game.mode) ? game.mode : 'single',
        outcome: ['win', 'loss', 'draw'].includes(game.outcome) ? game.outcome : 'loss',
        attempts: Math.max(0, Math.min(6, Number(game.attempts) || 0)),
        difficulty: normalizeText(game.difficulty),
        targetDriver: target && (target.id || target.name) ? target : null,
        durationMs: Number.isFinite(Number(game.durationMs)) && Number(game.durationMs) >= 0
            ? Number(game.durationMs)
            : null,
        roomId: normalizeText(game.roomId),
        matchId: normalizeText(game.matchId),
        opponentUsername: normalizeText(game.opponentUsername),
        winnerUsername: normalizeText(game.winnerUsername),
        completedAt: normalizeText(game.completedAt)
    };
}

function normalizeGames(games) {
    if (!Array.isArray(games)) return [];
    return games.map(normalizeGame).filter(Boolean).slice(0, HISTORY_LIMIT);
}

function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return 'Durată necunoscută';
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds} sec`;
    return `${minutes} min ${String(seconds).padStart(2, '0')} sec`;
}

function formatHistoryDate(completedAt) {
    const date = new Date(completedAt);
    if (!completedAt || Number.isNaN(date.getTime())) return 'Dată necunoscută';
    return new Intl.DateTimeFormat('ro-RO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function shortenIdentifier(value, maxLength = 24) {
    const normalized = normalizeText(value);
    if (!normalized || normalized.length <= maxLength) return normalized;
    const edgeLength = Math.max(4, Math.floor((maxLength - 1) / 2));
    return `${normalized.slice(0, edgeLength)}…${normalized.slice(-edgeLength)}`;
}

function createTextElement(documentObject, tagName, className, text) {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
}

function buildGameDetails(game) {
    const difficultyLabels = { easy: 'Ușor', medium: 'Mediu', hard: 'Greu' };
    const attemptsLabel = `${game.attempts} ${game.attempts === 1 ? 'încercare' : 'încercări'}`;
    return [
        difficultyLabels[game.difficulty] || 'Standard',
        attemptsLabel,
        formatDuration(game.durationMs)
    ].join(' · ');
}

function renderRecentGames(documentObject, games = []) {
    const container = documentObject?.getElementById?.('authGameHistory');
    if (!container) return [];

    const normalizedGames = normalizeGames(games);
    container.replaceChildren();

    if (normalizedGames.length === 0) {
        container.appendChild(createTextElement(
            documentObject,
            'p',
            'auth-history-empty',
            'Joacă prima rundă pentru a începe istoricul.'
        ));
        return normalizedGames;
    }

    const modeLabels = { single: 'Single', daily: 'Daily', duel: 'Duel' };
    const outcomeLabels = { win: '🏆 Victorie', loss: '◼ Înfrângere', draw: '🤝 Remiză' };

    for (const game of normalizedGames) {
        const item = documentObject.createElement('article');
        item.className = 'auth-history-item auth-history-item-complete';

        const header = documentObject.createElement('div');
        header.className = 'auth-history-header';
        header.append(
            createTextElement(
                documentObject,
                'strong',
                'auth-history-title',
                `${outcomeLabels[game.outcome]} · ${modeLabels[game.mode]}`
            ),
            createTextElement(documentObject, 'span', 'auth-history-summary', buildGameDetails(game))
        );

        const time = createTextElement(
            documentObject,
            'time',
            'auth-history-time',
            formatHistoryDate(game.completedAt)
        );
        if (game.completedAt) time.dateTime = game.completedAt;
        item.append(header, time);

        const facts = documentObject.createElement('div');
        facts.className = 'auth-history-facts';
        if (game.targetDriver?.name || game.targetDriver?.id) {
            const driver = game.targetDriver.name || game.targetDriver.id;
            facts.appendChild(createTextElement(
                documentObject,
                'span',
                'auth-history-fact auth-history-target',
                `Pilot corect: ${driver}`
            ));
        }
        if (game.opponentUsername) {
            facts.appendChild(createTextElement(
                documentObject,
                'span',
                'auth-history-fact',
                `Adversar: ${game.opponentUsername}`
            ));
        }
        if (game.winnerUsername) {
            facts.appendChild(createTextElement(
                documentObject,
                'span',
                'auth-history-fact',
                `Câștigător: ${game.winnerUsername}`
            ));
        } else if (game.outcome === 'draw') {
            facts.appendChild(createTextElement(documentObject, 'span', 'auth-history-fact', 'Câștigător: remiză'));
        }
        if (game.roomId) {
            facts.appendChild(createTextElement(
                documentObject,
                'span',
                'auth-history-fact auth-history-id',
                `Cameră: ${shortenIdentifier(game.roomId)}`
            ));
        }
        if (game.matchId) {
            const matchElement = createTextElement(
                documentObject,
                'span',
                'auth-history-fact auth-history-id',
                `Meci: ${shortenIdentifier(game.matchId)}`
            );
            matchElement.title = game.matchId;
            facts.appendChild(matchElement);
        }
        if (facts.children.length > 0) item.appendChild(facts);
        container.appendChild(item);
    }

    return normalizedGames;
}

function createAccountGameHistoryController({
    window: windowObject,
    document: documentObject,
    fetch: fetchFunction = windowObject?.fetch?.bind(windowObject)
} = {}) {
    if (!documentObject) throw new Error('Account game history controller requires a document.');
    let socket = null;
    let refreshPromise = null;

    function attachSocket(nextSocket) {
        if (!nextSocket || typeof nextSocket.on !== 'function' || nextSocket === socket) return;
        socket = nextSocket;
        socket.on('accountStatsUpdated', payload => renderRecentGames(documentObject, payload?.recentGames));
    }

    async function refresh() {
        if (refreshPromise || typeof fetchFunction !== 'function') return refreshPromise;
        refreshPromise = Promise.resolve(fetchFunction('/api/account/summary', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        })).then(async response => {
            if (!response?.ok) return null;
            const payload = await response.json().catch(() => null);
            if (payload) renderRecentGames(documentObject, payload.recentGames);
            return payload;
        }).catch(() => null).finally(() => {
            refreshPromise = null;
        });
        return refreshPromise;
    }

    function setup() {
        documentObject.getElementById('authTabHistory')?.addEventListener('click', () => {
            Promise.resolve().then(refresh);
        });
    }

    return { attachSocket, refresh, setup, render: games => renderRecentGames(documentObject, games) };
}

function install(windowObject) {
    const controller = createAccountGameHistoryController({
        window: windowObject,
        document: windowObject.document
    });
    controller.setup();
    windowObject.addEventListener('f1:socket-created', event => controller.attachSocket(event.detail?.socket));
    if (windowObject.__f1GameSocket) controller.attachSocket(windowObject.__f1GameSocket);
    windowObject.__f1AccountGameHistoryController = controller;
    return controller;
}

export {
    HISTORY_LIMIT,
    buildGameDetails,
    createAccountGameHistoryController,
    formatDuration,
    formatHistoryDate,
    install,
    normalizeGame,
    normalizeGames,
    renderRecentGames,
    shortenIdentifier
};

if (typeof window !== 'undefined' && window.document) install(window);
