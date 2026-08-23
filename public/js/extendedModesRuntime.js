import { RECORDS_KEY } from './extendedModesConfig.js';
import { formatWeeklyCountdown, updateWeeklyResetInfo } from './weeklyChallengeView.js';

export function readRecords(storage) {
    try {
        const parsed = JSON.parse(storage?.getItem?.(RECORDS_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function writeRecords(storage, records) {
    try {
        storage?.setItem?.(RECORDS_KEY, JSON.stringify(records));
    } catch {
        // Local records are optional; private browsing/storage errors must not block gameplay.
    }
}

export function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

export function normalizeName(value) {
    return String(value || '').trim().toLocaleLowerCase('ro-RO');
}

export function installSocketListeners(socket, controller) {
    const handlers = {
        extendedModeStarted: payload => controller.handleStarted(payload),
        extendedGuessResult: payload => controller.handleGuessResult(payload),
        extendedRoundResult: payload => controller.handleRoundResult(payload),
        extendedRoundReady: payload => controller.handleRoundReady(payload),
        extendedSudokuUpdate: payload => controller.handleSudokuUpdate(payload),
        extendedModeFinished: payload => controller.handleFinished(payload),
        extendedModeError: message => controller.handleError(message),
        weeklyChallengeStatus: payload => controller.handleWeeklyStatus(payload),
        extendedModeLeft: () => {}
    };
    for (const [eventName, handler] of Object.entries(handlers)) {
        socket.off?.(eventName, handler);
        socket.on?.(eventName, handler);
    }
    return handlers;
}

export function createExtendedModesRuntime({
    windowObject,
    elements,
    state,
    setStatus,
    getController
}) {
    const win = windowObject;

    function getSocket() {
        return win?.__f1GameSocket || state.socket || null;
    }

    function waitForSocket(timeoutMs = 3500) {
        const existing = getSocket();
        if (existing) return Promise.resolve(existing);
        return new Promise(resolve => {
            let finished = false;
            const timeout = win.setTimeout(() => {
                if (finished) return;
                finished = true;
                win.removeEventListener?.('f1:socket-created', handleCreated);
                resolve(win.__f1GameSocket || null);
            }, timeoutMs);
            function handleCreated(event) {
                if (finished) return;
                finished = true;
                win.clearTimeout(timeout);
                win.removeEventListener?.('f1:socket-created', handleCreated);
                resolve(event?.detail?.socket || win.__f1GameSocket || null);
            }
            win.addEventListener?.('f1:socket-created', handleCreated, { once: true });
        });
    }

    function bindSocket(socket) {
        if (!socket || state.socket === socket) return;
        if (state.socket && state.socketHandlers) {
            for (const [eventName, handler] of Object.entries(state.socketHandlers)) {
                state.socket.off?.(eventName, handler);
            }
        }
        state.socket = socket;
        state.socketHandlers = installSocketListeners(socket, getController());
    }

    function emit(eventName, payload) {
        const socket = getSocket();
        if (!socket) {
            setStatus('Conexiunea la server nu este disponibilă.', 'error');
            return false;
        }
        socket.emit(eventName, payload);
        return true;
    }

    function clearTimer() {
        if (state.timerInterval) win.clearInterval(state.timerInterval);
        state.timerInterval = null;
        state.timeoutSent = false;
    }

    function clearWeeklyCountdown() {
        if (state.weeklyCountdownInterval) win.clearInterval(state.weeklyCountdownInterval);
        state.weeklyCountdownInterval = null;
        state.weeklyResetInfo = null;
    }

    function getWeeklyCountdownText() {
        return formatWeeklyCountdown(state.weeklyStatus);
    }

    function updateWeeklyCountdown() {
        updateWeeklyResetInfo(state.weeklyResetInfo, state.weeklyStatus);
    }

    function startWeeklyCountdown(infoElement) {
        clearWeeklyCountdown();
        state.weeklyResetInfo = infoElement;
        updateWeeklyCountdown();
        state.weeklyCountdownInterval = win.setInterval(updateWeeklyCountdown, 1000);
    }

    function updateTimer() {
        const rawExpiresAt = state.serverState?.expiresAt;
        if (rawExpiresAt === null || rawExpiresAt === undefined) return;
        const expiresAt = Number(rawExpiresAt);
        if (!Number.isFinite(expiresAt)) return;
        const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        elements.metric.textContent = `${remaining}s`;
        elements.metric.dataset.urgent = String(remaining <= 10);
        if (remaining === 0 && !state.timeoutSent) {
            state.timeoutSent = true;
            emit('extendedModeTimeout');
        }
    }

    function syncTimer() {
        clearTimer();
        const rawExpiresAt = state.serverState?.expiresAt;
        if (rawExpiresAt === null || rawExpiresAt === undefined) return;
        const expiresAt = Number(rawExpiresAt);
        if (!Number.isFinite(expiresAt)) return;
        updateTimer();
        state.timerInterval = win.setInterval(updateTimer, 250);
    }

    return {
        bindSocket,
        clearTimer,
        clearWeeklyCountdown,
        emit,
        getWeeklyCountdownText,
        startWeeklyCountdown,
        syncTimer,
        waitForSocket
    };
}
