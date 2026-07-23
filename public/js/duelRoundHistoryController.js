const MAX_VISIBLE_ROUNDS = 10;

function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
        .filter(entry => entry && typeof entry === 'object')
        .slice(0, MAX_VISIBLE_ROUNDS);
}

function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return null;
    if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
    const seconds = durationMs / 1_000;
    return seconds < 60
        ? `${seconds.toFixed(seconds < 10 ? 1 : 0)} sec`
        : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatDifficulty(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'easy') return 'Easy';
    if (normalized === 'medium') return 'Medium';
    if (normalized === 'hard') return 'Hard';
    return 'Dificultate necunoscută';
}

function buildRoundTitle(entry) {
    const roundNumber = Number.isSafeInteger(entry?.match?.roundsPlayed) && entry.match.roundsPlayed > 0
        ? entry.match.roundsPlayed
        : entry?.sequence || '?';
    if (entry?.status === 'draw') return `Runda ${roundNumber} · Remiză`;
    return `Runda ${roundNumber} · ${entry?.winnerUsername || 'Câștigător necunoscut'}`;
}

function buildRoundMeta(entry) {
    const bestOf = [3, 5, 7].includes(Number(entry?.match?.bestOf)) ? `Best of ${Number(entry.match.bestOf)}` : null;
    const parts = [entry?.target?.name || 'Pilot necunoscut', formatDifficulty(entry?.difficulty)];
    if (bestOf) parts.push(bestOf);
    const duration = formatDuration(entry?.durationMs);
    if (duration) parts.push(duration);
    if (entry?.timed && Number.isFinite(entry.timeLimitSeconds)) parts.push(`limită ${entry.timeLimitSeconds}s`);
    return parts.join(' · ');
}

function buildScoreText(scoreboard) {
    if (!Array.isArray(scoreboard) || scoreboard.length === 0) return 'Scor indisponibil';
    return scoreboard
        .slice(0, 2)
        .map(entry => `${entry?.username || 'Guest'} ${Number(entry?.wins) || 0}`)
        .join(' – ');
}

function buildPlayerSummary(player) {
    const attempts = Number.isSafeInteger(player?.attempts) ? player.attempts : 0;
    const outcome = player?.outcome === 'win'
        ? 'victorie'
        : player?.outcome === 'draw' ? 'remiză' : 'înfrângere';
    return `${player?.username || 'Guest'} · ${outcome} · ${attempts} ${attempts === 1 ? 'încercare' : 'încercări'}`;
}

function createTextElement(documentObject, tagName, className, text) {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
}

function createGuessList(documentObject, guesses) {
    const list = documentObject.createElement('ol');
    list.className = 'duel-round-history-guesses';
    const entries = Array.isArray(guesses) ? guesses : [];

    if (entries.length === 0) {
        const empty = createTextElement(documentObject, 'li', 'duel-round-history-empty-guess', 'Fără încercări salvate.');
        list.append(empty);
        return list;
    }

    for (const guess of entries) {
        const attempt = Number.isSafeInteger(guess?.attempt) ? guess.attempt : '?';
        const name = guess?.guess?.name || 'Pilot necunoscut';
        const marker = guess?.isCorrect ? '✓' : '×';
        list.append(createTextElement(
            documentObject,
            'li',
            guess?.isCorrect ? 'is-correct' : '',
            `${marker} ${attempt}. ${name}`
        ));
    }
    return list;
}

function createHistoryItem(documentObject, entry) {
    const details = documentObject.createElement('details');
    details.className = 'duel-round-history-item';
    details.dataset.roundHistoryId = entry.id || '';

    const summary = documentObject.createElement('summary');
    const heading = documentObject.createElement('span');
    heading.className = 'duel-round-history-heading';
    heading.append(
        createTextElement(documentObject, 'strong', '', buildRoundTitle(entry)),
        createTextElement(documentObject, 'small', '', buildRoundMeta(entry))
    );
    summary.append(
        heading,
        createTextElement(documentObject, 'span', 'duel-round-history-score', buildScoreText(entry.scoreboard))
    );
    details.append(summary);

    const body = documentObject.createElement('div');
    body.className = 'duel-round-history-body';
    for (const player of entry.players || []) {
        const playerBlock = documentObject.createElement('section');
        playerBlock.className = 'duel-round-history-player';
        playerBlock.append(
            createTextElement(documentObject, 'strong', '', buildPlayerSummary(player)),
            createGuessList(documentObject, player.guesses)
        );
        body.append(playerBlock);
    }
    details.append(body);
    return details;
}

function createDuelRoundHistoryController({ document, schedule = callback => callback() } = {}) {
    if (!document) throw new Error('Duel round history controller requires a document.');
    let socket = null;
    let latestRoomState = null;
    let renderScheduled = false;

    function render(roomState = latestRoomState) {
        latestRoomState = roomState && typeof roomState === 'object' ? roomState : null;
        const history = normalizeHistory(latestRoomState?.roundHistory);
        const section = document.getElementById('duelRoundHistory');
        const count = document.getElementById('duelRoundHistoryCount');
        const empty = document.getElementById('duelRoundHistoryEmpty');
        const list = document.getElementById('duelRoundHistoryList');

        if (count) count.textContent = history.length ? `${history.length}/10` : '0/10';
        if (empty) empty.hidden = history.length > 0;
        if (list) {
            list.replaceChildren(...history.map(entry => createHistoryItem(document, entry)));
            list.hidden = history.length === 0;
        }
        if (section) section.classList.toggle('has-history', history.length > 0);
        return history;
    }

    function scheduleRender(roomState) {
        latestRoomState = roomState && typeof roomState === 'object' ? roomState : null;
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
        socket.on('roomStateUpdate', payload => scheduleRender(payload?.room || payload));
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
    const controller = createDuelRoundHistoryController({
        document: windowObject.document,
        schedule
    });

    windowObject.addEventListener('f1:socket-created', event => controller.attachSocket(event.detail?.socket));
    if (windowObject.__f1GameSocket) controller.attachSocket(windowObject.__f1GameSocket);
    windowObject.__f1DuelRoundHistoryController = controller;
    return controller;
}

export {
    MAX_VISIBLE_ROUNDS,
    buildPlayerSummary,
    buildRoundMeta,
    buildRoundTitle,
    buildScoreText,
    createDuelRoundHistoryController,
    createHistoryItem,
    formatDifficulty,
    formatDuration,
    install,
    normalizeHistory
};

if (typeof window !== 'undefined' && window.document) install(window);
