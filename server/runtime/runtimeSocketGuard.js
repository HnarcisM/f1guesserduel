'use strict';

const CLASSIC_EVENTS = new Set(['startSingleGame', 'submitSingleGuess', 'restartSingleGame']);
const DAILY_EVENTS = new Set(['startDailyChallenge', 'submitDailyGuess']);
const DUEL_EVENTS = new Set([
    'requestRoomList', 'joinRoom', 'updateDuelLobbySettings', 'setDuelReady', 'selectDuelPlayer',
    'resetDuelMatch', 'setDifficulty', 'submitGuess', 'timeExpired', 'restartGame', 'abortDuelRound'
]);
const EXTENDED_EVENTS = new Set([
    'submitExtendedGuess', 'continueExtendedMode', 'skipExtendedRound', 'submitExtendedSudokuGuess',
    'extendedModeTimeout', 'restartExtendedMode'
]);

function normalizeExtendedVariant(payload) {
    if (typeof payload === 'string') return payload.trim().toLowerCase();
    return String(payload?.variantKey || '').trim().toLowerCase();
}

function resolveSocketEventMode(eventName, args = [], activeExtendedMode = null) {
    if (CLASSIC_EVENTS.has(eventName)) return 'classic';
    if (DAILY_EVENTS.has(eventName)) return 'daily';
    if (DUEL_EVENTS.has(eventName)) return 'duel';
    if (eventName === 'startExtendedMode') return normalizeExtendedVariant(args[0]);
    if (EXTENDED_EVENTS.has(eventName)) return activeExtendedMode || null;
    return null;
}

function createRuntimeSocketGuard({ runtimeSettingsService, extendedSessions } = {}) {
    function evaluate({ eventName, args = [], socketId }) {
        if (!runtimeSettingsService) return { allowed: true };
        const activeExtendedMode = extendedSessions?.get?.(socketId)?.variantKey || null;
        const mode = resolveSocketEventMode(eventName, args, activeExtendedMode);
        if (!mode) return { allowed: true };
        return runtimeSettingsService.getRestriction(mode);
    }

    function notify(socket, decision) {
        if (decision?.allowed !== false) return;
        const payload = {
            reason: decision.reason,
            mode: decision.mode || null,
            message: decision.message
        };
        socket.emit?.('runtimeRestriction', payload);
        if (decision.mode && !['classic', 'daily', 'duel'].includes(decision.mode)) {
            socket.emit?.('extendedModeError', decision.message);
        }
    }

    return { evaluate, notify };
}

module.exports = {
    createRuntimeSocketGuard,
    normalizeExtendedVariant,
    resolveSocketEventMode
};
