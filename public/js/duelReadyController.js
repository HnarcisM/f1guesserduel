'use strict';

function createReadyApi() {

    function getPlayers(roomState = {}) {
        return Array.isArray(roomState.players) ? roomState.players.slice(0, 2) : [];
    }

    function getReadyViewState(roomState = {}) {
        const players = getPlayers(roomState);
        const you = roomState.you || players.find(player => player?.isYou) || null;
        const isPlaying = roomState.roundState === 'playing';
        const matchFinished = roomState.match?.status === 'finished';
        const isSpectator = you?.role === 'spectator';
        const isPlayer = Boolean(you && !isSpectator && players.some(player => player?.isYou));
        const isHost = Boolean(you?.isHost);
        const allReady = players.length === 2
            && players.every(player => player?.connected !== false && player?.ready === true);

        return {
            players,
            you,
            isPlaying,
            matchFinished,
            isSpectator,
            isPlayer,
            isHost,
            allReady,
            currentReady: Boolean(isPlayer && you?.ready === true),
            canReady: Boolean(isPlayer && !isPlaying && !matchFinished && you?.connected !== false),
            canStart: Boolean(isHost && !isSpectator && !isPlaying && !matchFinished && allReady)
        };
    }

    function getReadyHint(viewState) {
        if (viewState.isSpectator) return 'Spectatorii urmăresc lobby-ul, dar nu participă la Ready check.';
        if (!viewState.isPlayer) return 'Așteaptă să fii selectat ca jucător activ.';
        if (viewState.isPlaying) return 'Runda este în desfășurare. Confirmările se refac în lobby.';
        if (viewState.allReady) return viewState.isHost
            ? 'Ambii jucători sunt Ready. Poți porni runda.'
            : 'Ambii jucători sunt Ready. Hostul poate porni runda.';
        if (viewState.currentReady) return 'Ești Ready. Se așteaptă confirmarea celuilalt jucător.';
        return 'Confirmă când ești pregătit. Schimbarea setărilor sau a jucătorilor resetează ambele confirmări.';
    }

    function createBadge(documentObject, ready) {
        const badge = documentObject.createElement('span');
        badge.className = `duel-lobby-badge ready-status ${ready ? 'ready' : 'not-ready'}`;
        badge.textContent = ready ? 'Ready' : 'Not ready';
        return badge;
    }

    function renderMemberReadyBadges(documentObject, players) {
        const members = documentObject.getElementById('duelLobbyMembers');
        if (!members) return;

        Array.from(members.children).forEach((card, index) => {
            card.querySelectorAll?.('.duel-lobby-badge.ready-status').forEach(badge => badge.remove());
            const player = players[index];
            if (!player) return;
            const badges = card.querySelector?.('.duel-lobby-member-badges');
            badges?.appendChild(createBadge(documentObject, player.ready === true));
        });
    }

    function closeDuelResultUi(documentObject) {
        documentObject.getElementById('endGameDisplay')?.classList.remove('show');
        documentObject.getElementById('endGameBackdrop')?.classList.remove('show');

        const gameZone = documentObject.getElementById('gameZone');
        gameZone?.classList.remove('game-zone-rematch');
        gameZone?.classList.add('game-zone-hidden');

        const sendButton = documentObject.getElementById('sendGuessBtn');
        if (sendButton) {
            sendButton.classList.remove('rematch-submit-btn');
            sendButton.textContent = 'Trimite';
            sendButton.disabled = true;
        }

        const panel = documentObject.getElementById('duelLobbyPanel');
        panel?.classList.remove('is-hidden');
        panel?.setAttribute?.('aria-hidden', 'false');
        panel?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });

        const status = documentObject.getElementById('status');
        if (status) {
            status.classList.remove('is-hidden');
            status.textContent = 'Runda s-a terminat. Ambii jucători trebuie să confirme din nou Ready.';
        }
    }

    function createController({ document: documentObject, schedule = queueMicrotask } = {}) {
        if (!documentObject) throw new Error('Duel Ready controller requires a document.');

        let socket = null;
        let latestRoomState = null;
        let renderScheduled = false;
        let allowResultCloseClick = false;

        function render(roomState = latestRoomState || {}) {
            latestRoomState = roomState && typeof roomState === 'object' ? roomState : null;
            if (!latestRoomState) return;

            const viewState = getReadyViewState(latestRoomState);
            const readyButton = documentObject.getElementById('duelLobbyReadyBtn');
            const readyHint = documentObject.getElementById('duelLobbyReadyHint');
            const startButton = documentObject.getElementById('duelLobbyStartBtn');

            renderMemberReadyBadges(documentObject, viewState.players);

            if (readyButton) {
                readyButton.disabled = !viewState.canReady;
                readyButton.hidden = viewState.isSpectator || !viewState.isPlayer;
                readyButton.classList.toggle('is-ready', viewState.currentReady);
                readyButton.classList.toggle('is-locked', !viewState.canReady);
                readyButton.setAttribute('aria-pressed', String(viewState.currentReady));
                readyButton.setAttribute('aria-disabled', String(!viewState.canReady));
                readyButton.textContent = viewState.currentReady ? 'Anulează Ready' : 'Confirmă Ready';
            }

            if (readyHint) readyHint.textContent = getReadyHint(viewState);

            if (startButton) {
                startButton.disabled = !viewState.canStart;
                startButton.classList.toggle('is-locked', !viewState.canStart);
                startButton.setAttribute('aria-disabled', String(!viewState.canStart));
                startButton.title = viewState.canStart
                    ? 'Pornește runda'
                    : 'Ambii jucători trebuie să fie Ready înainte de start.';
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

        function attachSocket(nextSocket) {
            if (!nextSocket || typeof nextSocket.on !== 'function' || nextSocket === socket) return;
            socket = nextSocket;
            socket.on('roomStateUpdate', payload => scheduleRender(payload?.room || payload));
            socket.on('initGame', () => {
                if (latestRoomState) scheduleRender({ ...latestRoomState, roundState: 'playing' });
            });
        }

        function setup() {
            const readyButton = documentObject.getElementById('duelLobbyReadyBtn');
            readyButton?.addEventListener('click', () => {
                const viewState = getReadyViewState(latestRoomState || {});
                if (!viewState.canReady || !socket?.emit) return;
                socket.emit('setDuelReady', { ready: !viewState.currentReady });
            });
        }

        function shouldReturnToLobby(target) {
            const panel = documentObject.getElementById('duelLobbyPanel');
            const panelVisible = panel && !panel.classList.contains('is-hidden');
            if (!latestRoomState || !panelVisible || latestRoomState.roundState === 'playing') return false;
            return Boolean(target?.closest?.('#restartGameBtn, #closeEndGamePopup, #sendGuessBtn.rematch-submit-btn, #endGameBackdrop'));
        }

        function isRematchIntent(target) {
            return Boolean(target?.closest?.('#restartGameBtn, #sendGuessBtn.rematch-submit-btn'));
        }

        function ensureCurrentPlayerReady() {
            const viewState = getReadyViewState(latestRoomState || {});
            if (!viewState.canReady || viewState.currentReady || !socket?.emit) return false;
            socket.emit('setDuelReady', { ready: true });
            return true;
        }

        function handleCaptureClick(event) {
            if (allowResultCloseClick || !shouldReturnToLobby(event.target)) return;
            const shouldAutoReady = isRematchIntent(event.target);
            event.preventDefault();
            event.stopImmediatePropagation();

            const closeButton = documentObject.getElementById('closeEndGamePopup');
            if (closeButton?.click) {
                allowResultCloseClick = true;
                try {
                    closeButton.click();
                } finally {
                    allowResultCloseClick = false;
                }
            }

            if (shouldAutoReady) ensureCurrentPlayerReady();

            schedule(() => {
                closeDuelResultUi(documentObject);
                render();
            });
        }

        return {
            attachSocket,
            ensureCurrentPlayerReady,
            getLatestRoomState: () => latestRoomState,
            handleCaptureClick,
            render,
            scheduleRender,
            setup
        };
    }

    function install(windowObject) {
        const documentObject = windowObject.document;
        const schedule = typeof windowObject.queueMicrotask === 'function'
            ? windowObject.queueMicrotask.bind(windowObject)
            : callback => Promise.resolve().then(callback);
        const controller = createController({ document: documentObject, schedule });

        controller.setup();
        windowObject.addEventListener('f1:socket-created', event => controller.attachSocket(event.detail?.socket));
        if (windowObject.__f1GameSocket) controller.attachSocket(windowObject.__f1GameSocket);
        documentObject.addEventListener('click', controller.handleCaptureClick, true);
        windowObject.__f1DuelReadyController = controller;
        return controller;
    }

    return {
        closeDuelResultUi,
        createController,
        getReadyHint,
        getReadyViewState,
        install,
        renderMemberReadyBadges
    };
}

const duelReadyApi = createReadyApi();

export const closeDuelResultUi = duelReadyApi.closeDuelResultUi;
export const createController = duelReadyApi.createController;
export const getReadyHint = duelReadyApi.getReadyHint;
export const getReadyViewState = duelReadyApi.getReadyViewState;
export const install = duelReadyApi.install;
export const renderMemberReadyBadges = duelReadyApi.renderMemberReadyBadges;

if (typeof window !== 'undefined' && window.document) {
    duelReadyApi.install(window);
}
