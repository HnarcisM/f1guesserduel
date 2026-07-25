'use strict';

const { createAdminRepository } = require('./adminRepository');
const { buildPublicRoomListPayload } = require('../socket/roomListPayloads');
const { getDailyDateKey } = require('../game/dailyChallenge');
const { getIsoWeekInfo } = require('../game/weeklyChallenge');
const { isValidRoomId } = require('../config/constants');
const {
    DEFAULT_ADMIN_AUDIT_RETENTION_DAYS,
    DEFAULT_ADMIN_AUDIT_CLEANUP_BATCH_SIZE,
    DEFAULT_ADMIN_AUDIT_EXPORT_MAX_ROWS
} = require('../config/appConfig');

const SUSPENSION_DURATIONS_MS = Object.freeze({
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    permanent: null
});

function normalizeUserId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeReason(value) {
    const reason = String(value || '').trim().replace(/\s+/g, ' ');
    return reason.length >= 5 && reason.length <= 250 ? reason : null;
}


function normalizeAuditExportFormat(value) {
    const format = String(value || 'json').trim().toLowerCase();
    return format === 'json' || format === 'csv' ? format : null;
}

function escapeCsvCell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function serializeAuditCsv(entries) {
    const headers = ['id', 'createdAt', 'adminUsername', 'action', 'targetType', 'targetId', 'requestId', 'details'];
    const rows = entries.map(entry => [
        entry.id,
        entry.createdAt,
        entry.adminUsername,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.requestId,
        JSON.stringify(entry.details || {})
    ].map(escapeCsvCell).join(','));
    return `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`;
}

function buildAuditExportFilename(format, now) {
    const timestamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `admin-audit-${timestamp}.${format}`;
}

function createAdminService({
    database,
    roomStore,
    io,
    sessionService,
    repository = null,
    now = () => new Date(),
    isAdminUser = () => false,
    auditPolicy = {}
}) {
    const adminRepository = repository || createAdminRepository(database);
    const effectiveAuditPolicy = Object.freeze({
        retentionDays: Number.isSafeInteger(Number(auditPolicy.retentionDays)) && Number(auditPolicy.retentionDays) > 0
            ? Number(auditPolicy.retentionDays)
            : DEFAULT_ADMIN_AUDIT_RETENTION_DAYS,
        cleanupBatchSize: Number.isSafeInteger(Number(auditPolicy.cleanupBatchSize)) && Number(auditPolicy.cleanupBatchSize) > 0
            ? Number(auditPolicy.cleanupBatchSize)
            : DEFAULT_ADMIN_AUDIT_CLEANUP_BATCH_SIZE,
        exportMaxRows: Number.isSafeInteger(Number(auditPolicy.exportMaxRows)) && Number(auditPolicy.exportMaxRows) > 0
            ? Number(auditPolicy.exportMaxRows)
            : DEFAULT_ADMIN_AUDIT_EXPORT_MAX_ROWS
    });

    function getChallengeKeys() {
        const current = new Date(now());
        return {
            dailyDate: getDailyDateKey(current),
            weekKey: getIsoWeekInfo(current).key
        };
    }

    async function getOverview() {
        await roomStore.refreshAll?.();
        const keys = getChallengeKeys();
        const databaseOverview = await adminRepository.getOverview({
            weekKey: keys.weekKey,
            todayKey: keys.dailyDate
        });
        const roomPayload = buildPublicRoomListPayload(roomStore, { limit: 100 });
        return {
            ...databaseOverview,
            activeRooms: roomPayload.totalRooms,
            connectedSockets: Number(io?.engine?.clientsCount) || 0,
            dailyDate: keys.dailyDate,
            weekKey: keys.weekKey,
            generatedAt: new Date(now()).toISOString()
        };
    }

    async function listUsers(options) {
        return adminRepository.listUsers(options || {});
    }

    async function getUserDetails(userId) {
        const normalizedUserId = normalizeUserId(userId);
        if (!normalizedUserId) return { ok: false, status: 400, message: 'Utilizatorul selectat nu este valid.' };
        const details = await adminRepository.getUserDetails(normalizedUserId);
        if (!details) return { ok: false, status: 404, message: 'Utilizatorul nu a fost găsit.' };
        return { ok: true, ...details, challengeKeys: getChallengeKeys() };
    }

    async function listRooms() {
        await roomStore.refreshAll?.();
        return buildPublicRoomListPayload(roomStore, { limit: 100 });
    }

    async function listAudit(options) {
        const result = await adminRepository.listAudit(options || {});
        return {
            ...result,
            retentionDays: effectiveAuditPolicy.retentionDays,
            cleanupBatchSize: effectiveAuditPolicy.cleanupBatchSize
        };
    }

    async function exportAudit(options = {}) {
        const format = normalizeAuditExportFormat(options.format);
        if (!format) return { ok: false, status: 400, message: 'Formatul de export trebuie să fie json sau csv.' };

        const requestedLimit = effectiveAuditPolicy.exportMaxRows + 1;
        const rows = await adminRepository.listAuditForExport({
            action: options.action,
            search: options.search,
            limit: requestedLimit
        });
        const truncated = rows.length > effectiveAuditPolicy.exportMaxRows;
        const entries = rows.slice(0, effectiveAuditPolicy.exportMaxRows);
        const exportedAt = new Date(now()).toISOString();
        const filename = buildAuditExportFilename(format, exportedAt);

        if (format === 'csv') {
            return {
                ok: true,
                format,
                filename,
                contentType: 'text/csv; charset=utf-8',
                body: serializeAuditCsv(entries),
                count: entries.length,
                truncated
            };
        }

        return {
            ok: true,
            format,
            filename,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
                exportedAt,
                retentionDays: effectiveAuditPolicy.retentionDays,
                filters: {
                    action: String(options.action || '').trim().slice(0, 80) || null,
                    search: String(options.search || '').trim().slice(0, 100) || null
                },
                count: entries.length,
                truncated,
                entries
            }, null, 2),
            count: entries.length,
            truncated
        };
    }

    async function recordAuditEvent(entry) {
        return adminRepository.recordAudit(entry);
    }

    async function revokeUserSessions({ adminUserId, targetUserId, requestId }) {
        const normalizedTargetId = normalizeUserId(targetUserId);
        if (!normalizedTargetId) return { ok: false, status: 400, message: 'Utilizatorul selectat nu este valid.' };
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

    async function disconnectUserSockets(userId, payload) {
        if (typeof io?.fetchSockets !== 'function') return 0;
        const sockets = await io.fetchSockets();
        const matches = sockets.filter(socket => Number(socket?.data?.authUser?.id || socket?.user?.id) === Number(userId));
        for (const socket of matches) {
            socket.emit?.('accountSuspended', payload);
            socket.disconnect?.(true);
        }
        return matches.length;
    }

    async function suspendUser({ adminUserId, targetUserId, duration, reason, requestId }) {
        const normalizedTargetId = normalizeUserId(targetUserId);
        const cleanReason = normalizeReason(reason);
        if (!normalizedTargetId) return { ok: false, status: 400, message: 'Utilizatorul selectat nu este valid.' };
        if (normalizedTargetId === Number(adminUserId)) return { ok: false, status: 400, message: 'Nu îți poți suspenda propriul cont.' };
        const targetDetails = await adminRepository.getUserDetails(normalizedTargetId);
        if (!targetDetails) return { ok: false, status: 404, message: 'Utilizatorul nu a fost găsit.' };
        if (isAdminUser(targetDetails.user)) return { ok: false, status: 403, message: 'Un cont de administrator nu poate fi suspendat din panou.' };
        if (!Object.hasOwn(SUSPENSION_DURATIONS_MS, duration)) return { ok: false, status: 400, message: 'Durata suspendării nu este validă.' };
        if (!cleanReason) return { ok: false, status: 400, message: 'Motivul trebuie să aibă între 5 și 250 de caractere.' };

        const durationMs = SUSPENSION_DURATIONS_MS[duration];
        const suspendedUntil = durationMs === null ? null : new Date(new Date(now()).getTime() + durationMs).toISOString();
        const updated = await adminRepository.setUserSuspension({ userId: normalizedTargetId, reason: cleanReason, suspendedUntil });
        if (!updated) return { ok: false, status: 404, message: 'Utilizatorul nu a fost găsit.' };
        const revoked = await sessionService.destroyAllSessionsForUser(normalizedTargetId);
        const disconnectedSockets = await disconnectUserSockets(normalizedTargetId, {
            message: 'Contul tău a fost suspendat de administrator.',
            suspendedUntil
        });
        const revokedSessions = Number(revoked?.changes ?? revoked?.rowCount) || 0;
        await adminRepository.recordAudit({
            adminUserId,
            action: 'user.suspended',
            targetType: 'user',
            targetId: String(normalizedTargetId),
            details: { duration, suspendedUntil, reason: cleanReason, revokedSessions, disconnectedSockets },
            requestId
        });
        return { ok: true, userId: normalizedTargetId, suspendedUntil, revokedSessions, disconnectedSockets };
    }

    async function reactivateUser({ adminUserId, targetUserId, requestId }) {
        const normalizedTargetId = normalizeUserId(targetUserId);
        if (!normalizedTargetId) return { ok: false, status: 400, message: 'Utilizatorul selectat nu este valid.' };
        const updated = await adminRepository.clearUserSuspension(normalizedTargetId);
        if (!updated) return { ok: false, status: 404, message: 'Utilizatorul nu a fost găsit.' };
        await adminRepository.recordAudit({
            adminUserId,
            action: 'user.reactivated',
            targetType: 'user',
            targetId: String(normalizedTargetId),
            details: {},
            requestId
        });
        return { ok: true, userId: normalizedTargetId };
    }

    async function resetDailyAttempt({ adminUserId, targetUserId, requestId }) {
        const normalizedTargetId = normalizeUserId(targetUserId);
        if (!normalizedTargetId) return { ok: false, status: 400, message: 'Utilizatorul selectat nu este valid.' };
        const { dailyDate } = getChallengeKeys();
        const deletedAttempts = await adminRepository.resetDailyAttempts({ userId: normalizedTargetId, dailyDate });
        await adminRepository.recordAudit({
            adminUserId,
            action: 'challenge.daily.reset',
            targetType: 'user',
            targetId: String(normalizedTargetId),
            details: { dailyDate, deletedAttempts, historyPreserved: true },
            requestId
        });
        return { ok: true, dailyDate, deletedAttempts };
    }

    async function resetWeeklyAttempt({ adminUserId, targetUserId, requestId }) {
        const normalizedTargetId = normalizeUserId(targetUserId);
        if (!normalizedTargetId) return { ok: false, status: 400, message: 'Utilizatorul selectat nu este valid.' };
        const { weekKey } = getChallengeKeys();
        const deletedAttempts = await adminRepository.resetWeeklyAttempt({ userId: normalizedTargetId, weekKey });
        await adminRepository.recordAudit({
            adminUserId,
            action: 'challenge.weekly.reset',
            targetType: 'user',
            targetId: String(normalizedTargetId),
            details: { weekKey, deletedAttempts, historyPreserved: true },
            requestId
        });
        return { ok: true, weekKey, deletedAttempts };
    }

    async function closeRoom({ adminUserId, roomId, requestId }) {
        const cleanRoomId = String(roomId || '').trim();
        if (!isValidRoomId(cleanRoomId)) return { ok: false, status: 400, message: 'Camera selectată nu este validă.' };

        await roomStore.refreshRoom?.(cleanRoomId);
        const room = roomStore.get?.(cleanRoomId);
        if (!room) return { ok: false, status: 404, message: 'Camera nu mai există.' };

        const playerCount = Object.keys(room.players || {}).length;
        const spectatorCount = Object.keys(room.spectators || {}).length;
        io?.to?.(cleanRoomId)?.emit?.('duelAborted', { message: 'Camera a fost închisă de administrator.' });
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
        getUserDetails,
        listRooms,
        listAudit,
        exportAudit,
        recordAuditEvent,
        revokeUserSessions,
        suspendUser,
        reactivateUser,
        resetDailyAttempt,
        resetWeeklyAttempt,
        closeRoom
    };
}

module.exports = {
    createAdminService,
    SUSPENSION_DURATIONS_MS,
    normalizeReason,
    normalizeAuditExportFormat,
    escapeCsvCell,
    serializeAuditCsv,
    buildAuditExportFilename
};
