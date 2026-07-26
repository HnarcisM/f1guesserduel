'use strict';

const {
    applyMemberIdentity,
    buildLiveBoardState,
    buildPersonalRoundResult,
    buildPublicDuelMatch,
    buildPublicScoreboard,
    isSpectator
} = require('../rooms/roomService');
const {
    buildAccountStatsSocketPayload,
    recordAccountGameResultSafely
} = require('../account/accountStatsService');
const { buildDuelAccountResults } = require('./duelAccountResultBuilder');

function createDuelRoundResultEmitter({
    io, roomStore, accountStatsService, logger, getActiveRoomSockets,
    emitRoomStateUpdate, emitRoomListUpdate
}) {
    return async function emitRoundResolved(roomId, room, roundResult) {
        if (!room || !roundResult) return;
        roomStore.markDirty?.(roomId);

        const accountUpdatePromises = buildDuelAccountResults(roomId, room, roundResult)
            .map(async accountResult => {
                try {
                    const result = await recordAccountGameResultSafely({
                        accountStatsService,
                        logger,
                        ...accountResult
                    });
                    if (result?.stats) {
                        io.to(accountResult.socketId).emit(
                            'accountStatsUpdated',
                            buildAccountStatsSocketPayload(accountResult.userId, result)
                        );
                    }

                    const member = room.players?.[accountResult.socketId] || null;
                    if (!member || !result?.progress) return false;
                    return applyMemberIdentity(member, {
                        username: member.username,
                        avatarKey: member.avatarKey,
                        level: result.progress.level
                    });
                } catch (error) {
                    logger?.error?.('Duel identity refresh failed after XP update.', {
                        error,
                        roomId,
                        userId: accountResult.userId
                    });
                    return false;
                }
            });

        for (const memberSocket of await getActiveRoomSockets(roomId, room)) {
            const member = room.players?.[memberSocket.id] || room.spectators?.[memberSocket.id] || null;
            const payload = buildPersonalRoundResult(roundResult, member);
            if (!payload) continue;
            payload.scoreboard = buildPublicScoreboard(room);
            payload.match = buildPublicDuelMatch(room);
            if (isSpectator(room, memberSocket.id)) payload.liveBoard = buildLiveBoardState(room);
            memberSocket.emit('roundResolved', payload);
        }

        await emitRoomStateUpdate(roomId, 'round-resolved');
        await emitRoomListUpdate();

        const identityUpdates = await Promise.all(accountUpdatePromises);
        if (identityUpdates.some(Boolean)) {
            roomStore.markDirty?.(roomId);
            await emitRoomStateUpdate(roomId, 'account-progress-updated');
        }
    };
}

module.exports = { createDuelRoundResultEmitter };
