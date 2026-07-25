'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminService } = require('../server/admin/adminService');

function createFixtures() {
    const audits = [];
    const rooms = new Map([['ABC123', {
        roomId: 'ABC123',
        hostId: 'socket-1',
        players: {
            'socket-1': { socketId: 'socket-1', username: 'Host', isHost: true, connected: true }
        },
        spectators: {},
        roundState: 'waiting',
        lobbySettings: { difficulty: 'easy', timed: false, timeLimitSeconds: 60, bestOf: 3 },
        match: { bestOf: 3, roundsPlayed: 0 },
        scoreboard: []
    }]]);
    const emitted = [];
    const repository = {
        async getOverview() {
            return { totalUsers: 4, activeUsers24h: 2 };
        },
        async listUsers() { return { users: [], total: 0, limit: 25, offset: 0 }; },
        async listAudit() { return audits; },
        async recordAudit(entry) { audits.push(entry); return audits.length; }
    };
    const roomStore = {
        values() { return [...rooms.values()]; },
        get(id) { return rooms.get(id) || null; },
        remove(id) { return rooms.delete(id); },
        async saveNow() {},
        async refreshAll() {},
        async refreshRoom() {}
    };
    const io = {
        engine: { clientsCount: 3 },
        to(roomId) { return { emit(event, payload) { emitted.push({ scope: roomId, event, payload }); } }; },
        in(roomId) { return { socketsLeave(id) { emitted.push({ scope: roomId, event: 'leave', payload: id }); } }; },
        emit(event, payload) { emitted.push({ scope: 'all', event, payload }); }
    };
    const revoked = [];
    const sessionService = {
        async destroyAllSessionsForUser(userId) { revoked.push(userId); return { changes: 2 }; }
    };
    return { audits, rooms, emitted, repository, roomStore, io, sessionService, revoked };
}

test('admin overview combines database, room and socket counts', async () => {
    const f = createFixtures();
    const service = createAdminService({
        database: {}, roomStore: f.roomStore, io: f.io, sessionService: f.sessionService,
        repository: f.repository, now: () => new Date('2026-07-25T12:00:00Z')
    });
    const overview = await service.getOverview();
    assert.equal(overview.totalUsers, 4);
    assert.equal(overview.activeRooms, 1);
    assert.equal(overview.connectedSockets, 3);
});

test('admin session revocation rejects self-targeting and writes an audit entry', async () => {
    const f = createFixtures();
    const service = createAdminService({
        database: {}, roomStore: f.roomStore, io: f.io, sessionService: f.sessionService,
        repository: f.repository
    });
    const self = await service.revokeUserSessions({ adminUserId: 1, targetUserId: 1 });
    assert.equal(self.ok, false);
    const result = await service.revokeUserSessions({ adminUserId: 1, targetUserId: 9, requestId: 'req-1' });
    assert.deepEqual(result, { ok: true, revokedSessions: 2 });
    assert.deepEqual(f.revoked, [9]);
    assert.equal(f.audits[0].action, 'user.sessions.revoked');
    assert.equal(f.audits[0].targetId, '9');
});

test('admin can close a room and the action is broadcast and audited', async () => {
    const f = createFixtures();
    const service = createAdminService({
        database: {}, roomStore: f.roomStore, io: f.io, sessionService: f.sessionService,
        repository: f.repository
    });
    const result = await service.closeRoom({ adminUserId: 1, roomId: 'ABC123', requestId: 'req-2' });
    assert.deepEqual(result, { ok: true, roomId: 'ABC123' });
    assert.equal(f.rooms.has('ABC123'), false);
    assert.equal(f.emitted.some(entry => entry.event === 'duelAborted'), true);
    assert.equal(f.emitted.some(entry => entry.event === 'roomListUpdate'), true);
    assert.equal(f.audits[0].action, 'room.closed');
});

test('admin suspension revokes sessions, disconnects sockets and writes audit metadata', async () => {
    const audits = [];
    const repository = {
        async getUserDetails(userId) {
            return { user: { id: Number(userId), username: 'Pilot', effectiveStatus: 'active' } };
        },
        async setUserSuspension({ userId, reason, suspendedUntil }) {
            return { id: userId, username: 'Pilot', suspensionReason: reason, suspendedUntil };
        },
        async recordAudit(entry) { audits.push(entry); }
    };
    const disconnected = [];
    const socket = {
        data: { authUser: { id: 9 } },
        emit(event, payload) { disconnected.push({ event, payload }); },
        disconnect(force) { disconnected.push({ force }); }
    };
    const service = createAdminService({
        database: {},
        roomStore: { values() { return []; } },
        io: { async fetchSockets() { return [socket]; } },
        sessionService: { async destroyAllSessionsForUser() { return { changes: 2 }; } },
        repository,
        now: () => new Date('2026-07-25T12:00:00Z'),
        isAdminUser: () => false
    });

    const result = await service.suspendUser({
        adminUserId: 1,
        targetUserId: 9,
        duration: '24h',
        reason: 'Comportament abuziv repetat',
        requestId: 'req-suspend'
    });

    assert.equal(result.ok, true);
    assert.equal(result.revokedSessions, 2);
    assert.equal(result.disconnectedSockets, 1);
    assert.equal(result.suspendedUntil, '2026-07-26T12:00:00.000Z');
    assert.equal(disconnected.some(entry => entry.event === 'accountSuspended'), true);
    assert.equal(disconnected.some(entry => entry.force === true), true);
    assert.equal(audits[0].action, 'user.suspended');
    assert.equal(audits[0].details.reason, 'Comportament abuziv repetat');
});

test('admin cannot suspend itself or another configured administrator', async () => {
    const repository = {
        async getUserDetails(userId) { return { user: { id: Number(userId), username: 'OtherAdmin' } }; }
    };
    const service = createAdminService({
        database: {}, roomStore: { values() { return []; } }, io: {}, sessionService: {}, repository,
        isAdminUser: user => Number(user.id) === 2
    });

    assert.equal((await service.suspendUser({ adminUserId: 1, targetUserId: 1, duration: '1h', reason: 'Motiv suficient' })).status, 400);
    assert.equal((await service.suspendUser({ adminUserId: 1, targetUserId: 2, duration: '1h', reason: 'Motiv suficient' })).status, 403);
});

test('admin reset actions preserve history and audit only the current challenge claim', async () => {
    const audits = [];
    const repository = {
        async resetDailyAttempts() { return 3; },
        async resetWeeklyAttempt() { return 1; },
        async recordAudit(entry) { audits.push(entry); }
    };
    const service = createAdminService({
        database: {}, roomStore: { values() { return []; } }, io: {}, sessionService: {}, repository,
        now: () => new Date('2026-07-25T12:00:00Z')
    });

    const daily = await service.resetDailyAttempt({ adminUserId: 1, targetUserId: 9, requestId: 'd' });
    const weekly = await service.resetWeeklyAttempt({ adminUserId: 1, targetUserId: 9, requestId: 'w' });

    assert.deepEqual(daily, { ok: true, dailyDate: '2026-07-25', deletedAttempts: 3 });
    assert.equal(weekly.ok, true);
    assert.match(weekly.weekKey, /^2026-W\d{2}$/);
    assert.equal(audits[0].details.historyPreserved, true);
    assert.equal(audits[1].details.historyPreserved, true);
});

test('admin audit listing includes the active retention policy', async () => {
    const service = createAdminService({
        database: {},
        roomStore: { values() { return []; } },
        io: {},
        sessionService: {},
        repository: {
            async listAudit() { return { entries: [], total: 0, limit: 50, offset: 0 }; }
        },
        auditPolicy: { retentionDays: 180, cleanupBatchSize: 250, exportMaxRows: 1000 }
    });

    const result = await service.listAudit({});
    assert.equal(result.retentionDays, 180);
    assert.equal(result.cleanupBatchSize, 250);
});

test('admin audit export supports JSON and CSV with row limits and CSV formula protection', async () => {
    const entries = [
        {
            id: 1,
            createdAt: '2026-07-26T12:00:00.000Z',
            adminUsername: '=Admin',
            action: 'user.suspended',
            targetType: 'user',
            targetId: '2',
            requestId: 'req-1',
            details: { reason: '+formula' }
        },
        {
            id: 2,
            createdAt: '2026-07-26T12:01:00.000Z',
            adminUsername: 'Owner',
            action: 'room.closed',
            targetType: 'room',
            targetId: 'ABC123',
            requestId: 'req-2',
            details: {}
        }
    ];
    const calls = [];
    const service = createAdminService({
        database: {},
        roomStore: { values() { return []; } },
        io: {},
        sessionService: {},
        repository: {
            async listAuditForExport(options) { calls.push(options); return entries; }
        },
        now: () => new Date('2026-07-26T12:30:00.000Z'),
        auditPolicy: { retentionDays: 180, cleanupBatchSize: 250, exportMaxRows: 1 }
    });

    const json = await service.exportAudit({ format: 'json', action: 'user.', search: 'Admin' });
    assert.equal(json.ok, true);
    assert.equal(json.truncated, true);
    assert.equal(json.count, 1);
    assert.equal(calls[0].limit, 2);
    const jsonPayload = JSON.parse(json.body);
    assert.equal(jsonPayload.retentionDays, 180);
    assert.equal(jsonPayload.entries.length, 1);
    assert.deepEqual(jsonPayload.filters, { action: 'user.', search: 'Admin' });

    const csv = await service.exportAudit({ format: 'csv' });
    assert.equal(csv.ok, true);
    assert.match(csv.contentType, /^text\/csv/);
    assert.ok(csv.body.startsWith('\\uFEFF') || csv.body.charCodeAt(0) === 0xFEFF);
    assert.match(csv.body, /"'=Admin"/);
    assert.doesNotMatch(csv.body, /,"=Admin"/);
    assert.match(csv.filename, /^admin-audit-20260726T123000Z\.csv$/);

    assert.equal((await service.exportAudit({ format: 'xml' })).status, 400);
});
