const DUEL_BEST_OF_OPTIONS = Object.freeze([3, 5, 7]);
const DEFAULT_DUEL_BEST_OF = 3;

function normalizeBestOf(value, fallback = DEFAULT_DUEL_BEST_OF) {
    const parsed = Number(value);
    if (DUEL_BEST_OF_OPTIONS.includes(parsed)) return parsed;
    const fallbackParsed = Number(fallback);
    return DUEL_BEST_OF_OPTIONS.includes(fallbackParsed) ? fallbackParsed : DEFAULT_DUEL_BEST_OF;
}

function getWinsRequired(bestOf) {
    return Math.floor(normalizeBestOf(bestOf) / 2) + 1;
}

function normalizeScoreboard(scoreboard) {
    if (!Array.isArray(scoreboard)) return [];
    return scoreboard.slice(0, 2).map(entry => ({
        username: typeof entry?.username === 'string' && entry.username.trim() ? entry.username : 'Guest',
        wins: Number.isSafeInteger(Number(entry?.wins)) && Number(entry.wins) >= 0 ? Number(entry.wins) : 0
    }));
}

function getSeriesViewState(roomState = {}) {
    const settings = roomState.lobbySettings || {};
    const match = roomState.match || {};
    const bestOf = normalizeBestOf(match.bestOf ?? settings.bestOf);
    const winsRequired = Number.isSafeInteger(Number(match.winsRequired))
        ? Number(match.winsRequired)
        : getWinsRequired(bestOf);
    const status = ['waiting', 'active', 'finished'].includes(match.status) ? match.status : 'waiting';
    const you = roomState.you || {};
    const isHost = Boolean(you.isHost);
    const isSpectator = you.role === 'spectator';
    const isPlaying = roomState.roundState === 'playing';
    const scoreboard = normalizeScoreboard(roomState.scoreboard);

    return {
        bestOf,
        winsRequired,
        status,
        roundsPlayed: Number.isSafeInteger(Number(match.roundsPlayed)) ? Number(match.roundsPlayed) : 0,
        draws: Number.isSafeInteger(Number(match.draws)) ? Number(match.draws) : 0,
        winnerUsername: typeof match.winnerUsername === 'string' ? match.winnerUsername : null,
        scoreboard,
        isHost,
        isSpectator,
        isPlaying,
        canConfigure: isHost && !isSpectator && !isPlaying,
        canReset: isHost && !isSpectator && !isPlaying && status === 'finished',
        matchFinished: status === 'finished'
    };
}

function buildScoreText(scoreboard) {
    if (!Array.isArray(scoreboard) || scoreboard.length === 0) return 'Scor 0 - 0';
    if (scoreboard.length === 1) return `${scoreboard[0].username} ${scoreboard[0].wins} - 0`;
    return `${scoreboard[0].username} ${scoreboard[0].wins} - ${scoreboard[1].wins} ${scoreboard[1].username}`;
}

function buildSeriesStatus(viewState) {
    if (viewState.status === 'finished') {
        const winner = viewState.winnerUsername || 'Câștigătorul';
        return `${winner} a câștigat meciul. ${buildScoreText(viewState.scoreboard)}.`;
    }
    if (viewState.status === 'active') {
        const drawText = viewState.draws > 0
            ? ` · ${viewState.draws} ${viewState.draws === 1 ? 'remiză' : 'remize'}`
            : '';
        return `${buildScoreText(viewState.scoreboard)} · ${viewState.roundsPlayed} ${viewState.roundsPlayed === 1 ? 'rundă jucată' : 'runde jucate'}${drawText}.`;
    }
    return `Meciul nu a început. ${buildScoreText(viewState.scoreboard)}.`;
}

function buildSettingsPayload(roomState, bestOf) {
    const settings = roomState?.lobbySettings || {};
    return {
        level: settings.difficulty || roomState?.difficulty || 'easy',
        timed: settings.timed === true,
        timeLimitSeconds: Number(settings.timeLimitSeconds || roomState?.timeLimitSeconds || 60),
        bestOf: normalizeBestOf(bestOf)
    };
}

function buildMatchResultMessage(payload = {}) {
    const match = payload.match || {};
    if (match.status !== 'finished') return null;

    const scoreboard = normalizeScoreboard(payload.scoreboard);
    const bestOf = normalizeBestOf(match.bestOf);
    const winner = match.winnerUsername || payload.winnerUsername || 'Câștigătorul';
    return {
        title: payload.resultForYou?.outcome === 'win'
            ? '🏆 AI CÂȘTIGAT MECIUL!'
            : '🏁 MECI ÎNCHEIAT',
        message: `${winner} a câștigat seria Best of ${bestOf}. ${buildScoreText(scoreboard)}.`
    };
}

function createDuelSeriesController({
    document: documentObject,
    confirm: confirmAction = () => true,
    schedule = queueMicrotask
} = {}) {
    if (!documentObject) throw new Error('Duel Series controller requires a document.');

    let socket = null;
    let latestRoomState = null;
    let renderScheduled = false;

    function render(roomState = latestRoomState || {}) {
        latestRoomState = roomState && typeof roomState === 'object' ? roomState : null;
        if (!latestRoomState) return;

        const viewState = getSeriesViewState(latestRoomState);
        const summary = documentObject.getElementById('duelSeriesSummary');
        const title = documentObject.getElementById('duelSeriesTitle');
        const status = documentObject.getElementById('duelSeriesStatus');
        const formatHint = documentObject.getElementById('duelSeriesFormatHint');
        const resetButton = documentObject.getElementById('duelSeriesResetBtn');
        const startButton = documentObject.getElementById('duelLobbyStartBtn');
        const readyButton = documentObject.getElementById('duelLobbyReadyBtn');
        const readyHint = documentObject.getElementById('duelLobbyReadyHint');
        const scoreboardLabel = documentObject.querySelector?.('#roomScoreboard .room-scoreboard-label');

        documentObject.querySelectorAll?.('[data-duel-best-of]').forEach(button => {
            const selected = Number(button.dataset.duelBestOf) === viewState.bestOf;
            button.classList.toggle('active', selected);
            button.classList.toggle('is-locked', !viewState.canConfigure);
            button.disabled = !viewState.canConfigure;
            button.setAttribute('aria-pressed', String(selected));
            button.setAttribute('aria-disabled', String(!viewState.canConfigure));
        });

        if (title) title.textContent = `Best of ${viewState.bestOf} · primul la ${viewState.winsRequired} victorii`;
        if (status) status.textContent = buildSeriesStatus(viewState);
        if (formatHint) {
            formatHint.textContent = viewState.status === 'active'
                ? 'Schimbarea formatului resetează scorul meciului și confirmările Ready.'
                : `Primul jucător la ${viewState.winsRequired} victorii câștigă meciul.`;
        }
        if (summary) {
            summary.classList.toggle('is-active', viewState.status === 'active');
            summary.classList.toggle('is-finished', viewState.matchFinished);
        }
        if (resetButton) {
            resetButton.hidden = !viewState.matchFinished;
            resetButton.disabled = !viewState.canReset;
            resetButton.setAttribute('aria-disabled', String(!viewState.canReset));
        }
        if (scoreboardLabel) scoreboardLabel.textContent = `Scor meci · Best of ${viewState.bestOf}`;

        if (viewState.matchFinished) {
            if (startButton) {
                startButton.disabled = true;
                startButton.classList.add('is-locked');
                startButton.setAttribute('aria-disabled', 'true');
                startButton.title = 'Meciul s-a încheiat. Pornește un meci nou.';
            }
            if (readyButton) {
                readyButton.disabled = true;
                readyButton.classList.add('is-locked');
                readyButton.setAttribute('aria-disabled', 'true');
            }
            if (readyHint) readyHint.textContent = 'Meciul s-a încheiat. Hostul trebuie să pornească un meci nou.';
        }
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

    function customizeMatchResult(payload) {
        const result = buildMatchResultMessage(payload);
        if (!result) return;
        schedule(() => {
            const title = documentObject.getElementById('endGameTitle');
            const message = documentObject.getElementById('endGameMessage');
            const restart = documentObject.getElementById('restartGameBtn');
            if (title) title.textContent = result.title;
            if (message) message.textContent = result.message;
            if (restart) restart.textContent = '🏁 Revino în lobby';
        });
    }

    function attachSocket(nextSocket) {
        if (!nextSocket || typeof nextSocket.on !== 'function' || nextSocket === socket) return;
        socket = nextSocket;
        socket.on('roomStateUpdate', payload => scheduleRender(payload?.room || payload));
        socket.on('roundResolved', payload => {
            if (latestRoomState) {
                scheduleRender({
                    ...latestRoomState,
                    roundState: 'finished',
                    scoreboard: payload?.scoreboard || latestRoomState.scoreboard,
                    match: payload?.match || latestRoomState.match
                });
            }
            customizeMatchResult(payload);
        });
        socket.on('initGame', payload => {
            if (latestRoomState) {
                scheduleRender({
                    ...latestRoomState,
                    roundState: 'playing',
                    match: payload?.match || latestRoomState.match
                });
            }
        });
    }

    function setup() {
        documentObject.querySelectorAll?.('[data-duel-best-of]').forEach(button => {
            button.addEventListener('click', () => {
                const viewState = getSeriesViewState(latestRoomState || {});
                const nextBestOf = normalizeBestOf(button.dataset.duelBestOf);
                if (!viewState.canConfigure || nextBestOf === viewState.bestOf || !socket?.emit) return;

                if (viewState.status === 'active' && viewState.roundsPlayed > 0) {
                    const confirmed = confirmAction('Schimbarea formatului va reseta scorul meciului și confirmările Ready. Continui?');
                    if (!confirmed) return;
                }

                socket.emit('updateDuelLobbySettings', buildSettingsPayload(latestRoomState, nextBestOf));
            });
        });

        documentObject.getElementById('duelSeriesResetBtn')?.addEventListener('click', () => {
            const viewState = getSeriesViewState(latestRoomState || {});
            if (!viewState.canReset || !socket?.emit) return;
            socket.emit('resetDuelMatch');
        });
    }

    return {
        attachSocket,
        customizeMatchResult,
        getLatestRoomState: () => latestRoomState,
        render,
        scheduleRender,
        setup
    };
}

function install(windowObject) {
    const schedule = typeof windowObject.queueMicrotask === 'function'
        ? windowObject.queueMicrotask.bind(windowObject)
        : callback => Promise.resolve().then(callback);
    const controller = createDuelSeriesController({
        document: windowObject.document,
        confirm: windowObject.confirm?.bind(windowObject),
        schedule
    });

    controller.setup();
    windowObject.addEventListener('f1:socket-created', event => controller.attachSocket(event.detail?.socket));
    if (windowObject.__f1GameSocket) controller.attachSocket(windowObject.__f1GameSocket);
    windowObject.__f1DuelSeriesController = controller;
    return controller;
}

export {
    DEFAULT_DUEL_BEST_OF,
    DUEL_BEST_OF_OPTIONS,
    buildMatchResultMessage,
    buildScoreText,
    buildSeriesStatus,
    buildSettingsPayload,
    createDuelSeriesController,
    getSeriesViewState,
    getWinsRequired,
    install,
    normalizeBestOf,
    normalizeScoreboard
};

if (typeof window !== 'undefined' && window.document) install(window);
