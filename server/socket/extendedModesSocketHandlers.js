'use strict';

const { createExtendedModesService } = require('../game/extendedModesService');

const MIN_ACTION_INTERVAL_MS = 60;
const ACTION_WINDOW_MS = 60_000;
const MAX_ACTIONS_PER_WINDOW = 180;
const MAX_STARTS_PER_WINDOW = 20;

function normalizeStartPayload(payload) {
    if (typeof payload === 'string') {
        return { variantKey: payload, options: {} };
    }
    if (!payload || typeof payload !== 'object') return null;
    const variantKey = String(payload.variantKey || '').trim().toLowerCase();
    if (!variantKey) return null;
    const sourceOptions = payload.options && typeof payload.options === 'object' ? payload.options : {};
    return {
        variantKey,
        options: {
            difficulty: String(sourceOptions.difficulty || '').trim().toLowerCase() || undefined,
            eraKey: String(sourceOptions.eraKey || '').trim().toLowerCase() || undefined,
            seed: String(sourceOptions.seed || '').trim() || undefined
        }
    };
}

function normalizeGuessId(payload) {
    if (typeof payload === 'string') return payload.trim();
    if (!payload || typeof payload !== 'object') return '';
    return String(payload.id || payload.driverId || payload.entityId || '').trim();
}

function normalizeSudokuPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const cellIndex = Number(payload.cellIndex);
    const driverId = String(payload.driverId || payload.id || '').trim();
    if (!Number.isInteger(cellIndex) || !driverId) return null;
    return { cellIndex, driverId };
}

function registerExtendedModesSocketHandlers({
    socket,
    extendedSessions,
    gameService,
    leaveCurrentRoom,
    clearSoloModeSessions = null,
    onSocketEvent = socket.on.bind(socket),
    logger = console,
    clock = Date.now,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    service = null
}) {
    if (!socket || !extendedSessions || !gameService) {
        throw new Error('Extended modes socket handlers require socket, sessions and gameService.');
    }

    let extendedModesService = service;
    let startWindowStartedAt = clock();
    let startsInWindow = 0;
    if (!extendedModesService) {
        const drivers = gameService.getAllDrivers?.() || [];
        if (!Array.isArray(drivers) || drivers.length < 20) {
            onSocketEvent('startExtendedMode', () => {
                socket.emit('extendedModeError', 'Modurile noi nu sunt disponibile deoarece baza de piloți nu a putut fi încărcată.');
            });
            return {
                clearSession() {},
                getSession() { return null; },
                service: null,
                start() { return null; }
            };
        }
        extendedModesService = createExtendedModesService({ drivers, clock });
    }

    function getSession() {
        return extendedSessions.get(socket.id) || null;
    }

    function clearTimer(session) {
        if (!session?.timeoutHandle) return;
        clearTimeoutFn(session.timeoutHandle);
        session.timeoutHandle = null;
    }

    function clearSession() {
        const session = getSession();
        clearTimer(session);
        extendedSessions.delete(socket.id);
        return session;
    }

    function emitError(message) {
        const normalized = String(message || 'Acțiunea nu a putut fi efectuată.');
        socket.emit('extendedModeError', normalized);
    }

    function emitFinished(payload, session = getSession()) {
        if (!payload) return;
        clearTimer(session);
        socket.emit('extendedModeFinished', payload);
    }

    function scheduleTimeout(session) {
        clearTimer(session);
        if (!Number.isFinite(session?.expiresAt)) return;
        const delay = Math.max(1, session.expiresAt - clock());
        session.timeoutHandle = setTimeoutFn(() => {
            const current = getSession();
            if (!current || current.id !== session.id || current.phase !== 'playing') return;
            const finished = extendedModesService.expireSession(current);
            if (finished) emitFinished(finished, current);
        }, delay);
        session.timeoutHandle?.unref?.();
    }

    function consumeStart() {
        const now = clock();
        if (now - startWindowStartedAt >= ACTION_WINDOW_MS) {
            startWindowStartedAt = now;
            startsInWindow = 0;
        }
        if (startsInWindow >= MAX_STARTS_PER_WINDOW) {
            emitError('Ai pornit prea multe sesiuni într-un timp scurt. Așteaptă puțin.');
            return false;
        }
        startsInWindow += 1;
        return true;
    }

    function consumeAction(session) {
        const now = clock();
        if (Number.isFinite(session.lastActionAt) && now - session.lastActionAt < MIN_ACTION_INTERVAL_MS) {
            return false;
        }
        if (!Number.isFinite(session.actionWindowStartedAt) || now - session.actionWindowStartedAt >= ACTION_WINDOW_MS) {
            session.actionWindowStartedAt = now;
            session.actionsInWindow = 0;
        }
        if ((session.actionsInWindow || 0) >= MAX_ACTIONS_PER_WINDOW) {
            emitError('Prea multe acțiuni într-un timp scurt. Așteaptă câteva secunde.');
            return false;
        }
        session.actionsInWindow = (session.actionsInWindow || 0) + 1;
        session.lastActionAt = now;
        return true;
    }

    async function start(payload, { reuseOptions = null } = {}) {
        if (!consumeStart()) return null;
        const normalized = reuseOptions || normalizeStartPayload(payload);
        if (!normalized) {
            emitError('Modul selectat nu este valid.');
            return null;
        }

        await leaveCurrentRoom?.();
        clearSoloModeSessions?.();
        clearSession();

        let session;
        try {
            session = extendedModesService.startSession(normalized.variantKey, normalized.options);
        } catch (error) {
            logger?.error?.('Extended mode could not be started.', {
                variantKey: normalized.variantKey,
                error
            });
            emitError('Nu am putut genera provocarea. Verifică datele modului și încearcă din nou.');
            return null;
        }

        if (!session) {
            emitError('Modul selectat nu este disponibil.');
            return null;
        }

        session.startRequest = normalized;
        extendedSessions.set(socket.id, session);
        scheduleTimeout(session);
        socket.emit('extendedModeStarted', extendedModesService.buildStartedPayload(session));
        return session;
    }

    onSocketEvent('startExtendedMode', payload => start(payload));

    onSocketEvent('submitExtendedGuess', payload => {
        const session = getSession();
        if (!session) {
            emitError('Pornește mai întâi modul de joc.');
            return;
        }
        if (!consumeAction(session)) return;
        const guessId = normalizeGuessId(payload);
        if (!guessId) {
            emitError('Selecția nu este validă.');
            return;
        }

        const result = extendedModesService.submitGuess(session, guessId);
        if (result.error) {
            emitError(result.error);
            return;
        }

        if (result.feedback) {
            socket.emit('extendedGuessResult', {
                variantKey: session.variantKey,
                feedback: result.feedback,
                isCorrect: Boolean(result.isCorrect),
                roundComplete: true,
                state: extendedModesService.buildSessionState(session)
            });
        } else if (result.payload && !result.finished) {
            socket.emit('extendedGuessResult', {
                ...result.payload,
                roundComplete: Boolean(result.roundComplete)
            });
        }

        if (result.finished) {
            emitFinished(result.payload, session);
        }
    });

    onSocketEvent('continueExtendedMode', () => {
        const session = getSession();
        if (!session) {
            emitError('Sesiunea nu mai este activă.');
            return;
        }
        if (!consumeAction(session)) return;
        const result = extendedModesService.continueSession(session);
        if (result.error) {
            emitError(result.error);
            return;
        }
        if (result.finished) {
            emitFinished(result.payload, session);
            return;
        }
        socket.emit('extendedRoundReady', result.payload);
    });

    onSocketEvent('skipExtendedRound', () => {
        const session = getSession();
        if (!session) {
            emitError('Sesiunea nu mai este activă.');
            return;
        }
        if (!consumeAction(session)) return;
        const result = extendedModesService.skipRound(session);
        if (result.error) {
            emitError(result.error);
            return;
        }
        if (result.finished) {
            emitFinished(result.payload, session);
            return;
        }
        socket.emit('extendedRoundResult', result.payload);
    });

    onSocketEvent('submitExtendedSudokuGuess', payload => {
        const session = getSession();
        if (!session) {
            emitError('Pilot Sudoku nu este activ.');
            return;
        }
        if (!consumeAction(session)) return;
        const normalized = normalizeSudokuPayload(payload);
        if (!normalized) {
            emitError('Celula sau pilotul selectat nu este valid.');
            return;
        }
        const result = extendedModesService.submitSudokuGuess(
            session,
            normalized.cellIndex,
            normalized.driverId
        );
        if (result.error) {
            emitError(result.error);
            return;
        }
        if (result.finished) {
            emitFinished(result.payload, session);
            return;
        }
        socket.emit('extendedSudokuUpdate', result.payload);
    });

    onSocketEvent('extendedModeTimeout', () => {
        const session = getSession();
        if (!session) return;
        const finished = extendedModesService.expireSession(session);
        if (finished) emitFinished(finished, session);
    });

    onSocketEvent('restartExtendedMode', () => {
        const session = getSession();
        if (!session?.startRequest) {
            emitError('Nu există un mod care poate fi repornit.');
            return;
        }
        const request = {
            variantKey: session.startRequest.variantKey,
            options: { ...session.startRequest.options }
        };
        start(null, { reuseOptions: request });
    });

    onSocketEvent('leaveExtendedMode', () => {
        clearSession();
        socket.emit('extendedModeLeft');
    });

    socket.on('disconnect', clearSession);

    return {
        clearSession,
        getSession,
        service: extendedModesService,
        start
    };
}

module.exports = {
    ACTION_WINDOW_MS,
    MAX_ACTIONS_PER_WINDOW,
    MAX_STARTS_PER_WINDOW,
    MIN_ACTION_INTERVAL_MS,
    normalizeGuessId,
    normalizeStartPayload,
    normalizeSudokuPayload,
    registerExtendedModesSocketHandlers
};
