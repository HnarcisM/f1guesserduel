'use strict';

const { EXTENDED_VARIANTS } = require('../game/extendedModesService');
const {
    WEEKLY_DIFFICULTIES,
    getIsoWeekInfo,
    getNextWeeklyResetAt
} = require('../game/weeklyChallenge');

function createWeeklyChallengeCoordinator({
    socket,
    accountStatsService,
    logger = console,
    now = () => new Date(),
    clearSession,
    emitError
}) {
    function getCurrentContext() {
        const currentDate = now();
        return {
            currentDate,
            weekKey: getIsoWeekInfo(currentDate).key,
            nextResetAt: getNextWeeklyResetAt(currentDate)
        };
    }

    async function emitStatus() {
        const { weekKey, nextResetAt } = getCurrentContext();
        const userId = socket.user?.id;
        if (!userId) {
            const payload = {
                authenticated: false,
                weekKey,
                nextResetAt,
                claimed: false,
                difficulty: null,
                challengeId: null,
                result: null
            };
            socket.emit('weeklyChallengeStatus', payload);
            return payload;
        }

        if (!accountStatsService?.getWeeklyChallengeStatus) {
            emitError('Weekly Challenge nu este disponibil momentan. Încearcă din nou mai târziu.');
            return null;
        }

        try {
            const status = await accountStatsService.getWeeklyChallengeStatus(userId, weekKey);
            const payload = { authenticated: true, nextResetAt, ...status };
            socket.emit('weeklyChallengeStatus', payload);
            return payload;
        } catch (error) {
            logger?.error?.('Weekly Challenge status lookup failed.', { error, userId, weekKey });
            emitError('Nu am putut verifica disponibilitatea Weekly Challenge. Încearcă din nou.');
            return null;
        }
    }

    function isWeeklySession(session) {
        return session?.variantKey === EXTENDED_VARIANTS.WEEKLY;
    }

    function ensureSessionOwner(session) {
        if (!isWeeklySession(session)) return true;
        if (socket.user?.id && String(socket.user.id) === String(session.userId)) return true;
        clearSession();
        emitError('Sesiunea Weekly necesită contul care a pornit provocarea.');
        return false;
    }

    async function prepareStart(normalized, { reuseOptions = null, service }) {
        const isWeekly = normalized.variantKey === EXTENDED_VARIANTS.WEEKLY;
        if (!isWeekly) return { isWeekly: false, session: null, blocked: false };

        if (reuseOptions) {
            emitError('Weekly Challenge poate fi jucat o singură dată pe săptămână.');
            await emitStatus();
            return { isWeekly: true, session: null, blocked: true };
        }

        const difficulty = WEEKLY_DIFFICULTIES.includes(normalized.options.difficulty)
            ? normalized.options.difficulty
            : null;
        if (!difficulty) {
            emitError('Alege dificultatea Weekly Challenge.');
            return { isWeekly: true, session: null, blocked: true };
        }

        const userId = socket.user?.id;
        if (!userId) {
            emitError('Autentifică-te pentru a juca Weekly Challenge.');
            await emitStatus();
            return { isWeekly: true, session: null, blocked: true };
        }
        if (!accountStatsService?.claimWeeklyChallenge) {
            emitError('Weekly Challenge nu este disponibil momentan. Încearcă din nou mai târziu.');
            return { isWeekly: true, session: null, blocked: true };
        }

        const { currentDate, weekKey } = getCurrentContext();
        let session;
        try {
            session = service.startSession(EXTENDED_VARIANTS.WEEKLY, { difficulty, date: currentDate });
        } catch (error) {
            logger?.error?.('Weekly Challenge could not be generated.', { error, difficulty, weekKey });
            emitError('Nu am putut genera provocarea Weekly pentru dificultatea selectată.');
            return { isWeekly: true, session: null, blocked: true };
        }

        try {
            const claimed = await accountStatsService.claimWeeklyChallenge({
                userId,
                weekKey: session.weekKey,
                challengeId: session.challengeId,
                difficulty: session.difficulty
            });
            if (!claimed) {
                await emitStatus();
                emitError('Ai folosit deja încercarea Weekly din această săptămână.');
                return { isWeekly: true, session: null, blocked: true };
            }
        } catch (error) {
            logger?.error?.('Weekly Challenge claim failed.', { error, userId, weekKey, difficulty });
            emitError('Nu am putut rezerva încercarea Weekly. Încearcă din nou.');
            return { isWeekly: true, session: null, blocked: true };
        }

        session.userId = userId;
        session.startRequest = {
            variantKey: EXTENDED_VARIANTS.WEEKLY,
            options: { difficulty }
        };
        return { isWeekly: true, session, blocked: false };
    }

    async function persistResult(payload, session) {
        if (!isWeeklySession(session) || !payload || !accountStatsService?.completeWeeklyChallenge) return;
        try {
            await accountStatsService.completeWeeklyChallenge({
                userId: session.userId,
                weekKey: session.weekKey,
                challengeId: session.challengeId,
                difficulty: session.difficulty,
                score: payload.score,
                roundsCompleted: payload.roundsCompleted,
                roundsPlayed: payload.roundsPlayed,
                durationMs: payload.durationMs,
                finishReason: payload.reason
            });
        } catch (error) {
            logger?.error?.('Weekly Challenge result persistence failed.', {
                error,
                userId: session.userId,
                weekKey: session.weekKey,
                challengeId: session.challengeId
            });
        }
    }

    return {
        emitStatus,
        ensureSessionOwner,
        getCurrentContext,
        isWeeklySession,
        persistResult,
        prepareStart
    };
}

module.exports = { createWeeklyChallengeCoordinator };
