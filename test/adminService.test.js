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
