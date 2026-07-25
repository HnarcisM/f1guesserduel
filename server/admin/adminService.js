'use strict';

const { createAdminRepository } = require('./adminRepository');
const { buildPublicRoomListPayload } = require('../socket/roomListPayloads');
const { getIsoWeekInfo } = require('../game/weeklyChallenge');
const { isValidRoomId } = require('../config/constants');

function createAdminService({ database, roomStore, io, sessionService, repository = null, now = () => new Date() }) {
    const adminRepository = repository || createAdminRepository(database);

    async function getOverview() {
        await roomStore.refreshAll?.();
        const databaseOverview = await adminRepository.getOverview({
            weekKey: getIsoWeekInfo(now()).key
        });
        const roomPayload = buildPublicRoomListPayload(roomStore, { limit: 100 });
        return {
            ...databaseOverview,
            activeRooms: roomPayload.totalRooms,
            connectedSockets: Number(io?.engine?.clientsCount) || 0,
            generatedAt: new Date(now()).toISOString()
        };
    }

    async function listUsers(options) {
        return adminRepository.listUsers(options || {});
    }

    async function listRooms() {
        await roomStore.refreshAll?.();
        return buildPublicRoomListPayload(roomStore, { limit: 100 });
    }

    async function listAudit(options) {
        return adminRepository.listAudit(options || {});
    }

    async function recordAuditEvent(entry) {
        return adminRepository.recordAudit(entry);
    }

    async function revokeUserSessions({ adminUserId, targetUserId, requestId }) {
        const normalizedTargetId = Number(targetUserId);
        if (!Number.isSafeInteger(normalizedTargetId) || normalizedTargetId <= 0) {
            return { ok: false, status: 400, message: 'Utilizatorul selectat nu este valid.' };
        }
        if (normalizedTargetId === Number(adminUserId)) {
            return { ok: false, status: 400, message: 'Nu îți poți revoca propria sesiune din acest panou.' };
        }

        const result = await sessionService.destroyAllSessionsForUser(normalizedTargetId);
        const revokedSessions = Number(result?.changes ?? result?.rowCount) || 0;
        await adminRepository.recordAudit({
            adminUserId,
            action: 'user.sessions.revoked',
            targetType: 'user',
            targetId: String(normalizedTargetId),
            details: { revokedSessions },
            requestId
        });
        return { ok: true, revokedSessions };
    }

    async function closeRoom({ adminUserId, roomId, requestId }) {
        const cleanRoomId = String(roomId || '').trim();
        if (!isValidRoomId(cleanRoomId)) {
            return { ok: false, status: 400, message: 'Camera selectată nu este validă.' };
        }

        await roomStore.refreshRoom?.(cleanRoomId);
        const room = roomStore.get?.(cleanRoomId);
        if (!room) {
            return { ok: false, status: 404, message: 'Camera nu mai există.' };
        }

        const playerCount = Object.keys(room.players || {}).length;
        const spectatorCount = Object.keys(room.spectators || {}).length;
        io?.to?.(cleanRoomId)?.emit?.('duelAborted', {
            message: 'Camera a fost închisă de administrator.'
        });
        roomStore.remove(cleanRoomId);
        await roomStore.saveNow?.();
        await io?.in?.(cleanRoomId)?.socketsLeave?.(cleanRoomId);
        io?.emit?.('roomListUpdate', buildPublicRoomListPayload(roomStore));

        await adminRepository.recordAudit({
            adminUserId,
            action: 'room.closed',
            targetType: 'room',
            targetId: cleanRoomId,
            details: { playerCount, spectatorCount },
            requestId
        });
        return { ok: true, roomId: cleanRoomId };
    }

    return {
        getOverview,
        listUsers,
        listRooms,
        listAudit,
        recordAuditEvent,
        revokeUserSessions,
        closeRoom
    };
}

module.exports = { createAdminService };
