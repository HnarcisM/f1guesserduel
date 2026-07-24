const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createRoom,
    addPlayerToRoom,
    getPlayer,
    buildLiveBoardState,
    buildPublicRoomState,
    buildPublicScoreboard
} = require('../server/rooms/roomService');
const {
    DEFAULT_DUEL_LEVEL,
    buildPublicMemberIdentity,
    applyMemberIdentity
} = require('../server/rooms/memberIdentity');
const { createRoomStateEmitter } = require('../server/socket/roomStateEmitter');
const {
    resolveDuelAuthUser,
    resolveSocketDuelAuthUser
} = require('../server/socket/duelIdentityResolver');

test('Duel identity normalizes avatar and level without copying private account fields', () => {
    const identity = buildPublicMemberIdentity({
        id: 7,
        username: '  Narcis  ',
        email: 'private@example.com',
        avatarKey: 'HELMET-BLUE',
        level: 4,
        sessionToken: 'secret'
    });

    assert.deepEqual(identity, {
        username: 'Narcis',
        avatarKey: 'helmet-blue',
        level: 4
    });
    assert.equal(identity.email, undefined);
    assert.equal(identity.id, undefined);
    assert.equal(identity.sessionToken, undefined);

    assert.deepEqual(buildPublicMemberIdentity({ username: '', avatarKey: '../../x.svg', level: -1 }), {
        username: 'Guest',
        avatarKey: 'helmet-red',
        level: DEFAULT_DUEL_LEVEL
    });
});

test('Duel identity resolver reads only authoritative account progress and falls back safely', async () => {
    const calls = [];
    const authUser = {
        id: 7,
        username: 'Narcis',
        email: 'private@example.com',
        avatarKey: 'helmet-purple'
    };
    const resolved = await resolveDuelAuthUser({
        authUser,
        accountStatsService: {
            async getAccountProgress(userId) {
                calls.push(userId);
                return { level: 6, totalXp: 2_500 };
            }
        }
    });

    assert.deepEqual(calls, [7]);
    assert.deepEqual(resolved, {
        id: 7,
        username: 'Narcis',
        avatarKey: 'helmet-purple',
        level: 6
    });
    assert.equal(resolved.email, undefined);

    const warnings = [];
    const fallback = await resolveDuelAuthUser({
        authUser,
        accountStatsService: {
            async getAccountProgress() {
                throw new Error('database unavailable');
            }
        },
        logger: { warn(message) { warnings.push(message); } }
    });
    assert.equal(fallback.level, 1);
    assert.equal(warnings.length, 1);
});

test('lobby, scoreboard and live board expose avatar and level but no private member data', () => {
    const room = createRoom('identity-room', 'socket-host', {
        id: 7,
        username: 'Narcis',
        email: 'private@example.com',
        avatarKey: 'helmet-blue',
        level: 5,
        accessToken: 'secret'
    });
    addPlayerToRoom(room, 'socket-rival', {
        id: 8,
        username: 'Rival',
        email: 'rival@example.com',
        avatarKey: 'helmet-green',
        level: 3
    });

    const lobby = buildPublicRoomState(room, { recipientSocketId: 'socket-host' });
    const scoreboard = buildPublicScoreboard(room);
    const liveBoard = buildLiveBoardState(room);

    assert.deepEqual(
        lobby.players.map(({ username, avatarKey, level }) => ({ username, avatarKey, level })),
        [
            { username: 'Narcis', avatarKey: 'helmet-blue', level: 5 },
            { username: 'Rival', avatarKey: 'helmet-green', level: 3 }
        ]
    );
    assert.deepEqual(
        scoreboard.map(({ username, avatarKey, level, wins }) => ({ username, avatarKey, level, wins })),
        [
            { username: 'Narcis', avatarKey: 'helmet-blue', level: 5, wins: 0 },
            { username: 'Rival', avatarKey: 'helmet-green', level: 3, wins: 0 }
        ]
    );
    assert.equal(liveBoard.players[0].avatarKey, 'helmet-blue');
    assert.equal(liveBoard.players[0].level, 5);

    for (const payload of [lobby, scoreboard, liveBoard]) {
        const serialized = JSON.stringify(payload);
        assert.doesNotMatch(serialized, /private@example\.com|rival@example\.com|accessToken|sessionToken/);
        assert.doesNotMatch(serialized, /socket-host|socket-rival/);
        assert.doesNotMatch(serialized, /"userId"|"participantKey"|"scoreKey"/);
    }
});

test('member identity can update level after authoritative Duel XP is recorded', () => {
    const room = createRoom('identity-room', 'socket-host', {
        id: 7,
        username: 'Narcis',
        avatarKey: 'helmet-blue',
        level: 1
    });
    const member = getPlayer(room, 'socket-host');

    assert.equal(applyMemberIdentity(member, {
        username: member.username,
        avatarKey: member.avatarKey,
        level: 2
    }), true);
    assert.equal(buildPublicScoreboard(room)[0].level, 2);
    assert.equal(applyMemberIdentity(member, {
        username: member.username,
        avatarKey: member.avatarKey,
        level: 2
    }), false);
});

test('host status sends only the safe public Duel identity', () => {
    const room = createRoom('identity-room', 'socket-host', {
        id: 7,
        username: 'Narcis',
        email: 'private@example.com',
        avatarKey: 'helmet-cyan',
        level: 4
    });
    const emitted = [];
    const socket = {
        id: 'socket-host',
        user: { id: 7, username: 'Narcis', email: 'private@example.com', avatarKey: 'helmet-cyan' },
        data: {},
        emit(eventName, payload) { emitted.push({ eventName, payload }); }
    };
    const emitter = createRoomStateEmitter({ sockets: { sockets: new Map() } }, {
        get() { return room; },
        has() { return true; },
        markDirty() {}
    });

    emitter.emitHostStatus(socket, room);
    const payload = emitted[0].payload;
    assert.equal(payload.avatarKey, 'helmet-cyan');
    assert.equal(payload.level, 4);
    assert.deepEqual(payload.user, {
        username: 'Narcis',
        avatarKey: 'helmet-cyan',
        level: 4
    });
    assert.equal(payload.user.email, undefined);
    assert.equal(payload.user.id, undefined);
});


test('Duel identity helpers cover guest, legacy and bounded public fallbacks', () => {
    assert.deepEqual(buildPublicMemberIdentity({
        username: 42,
        avatar_key: 'helmet-yellow',
        level: 10_001
    }, 'Legacy Guest'), {
        username: 'Legacy Guest',
        avatarKey: 'helmet-yellow',
        level: 1
    });
    assert.equal(buildPublicMemberIdentity({ username: 'x'.repeat(30) }).username.length, 20);
    assert.equal(applyMemberIdentity(null, {}), false);

    const member = { guestUsername: 'Guest 9' };
    assert.equal(applyMemberIdentity(member, {}), true);
    assert.deepEqual(member, {
        guestUsername: 'Guest 9',
        username: 'Guest 9',
        avatarKey: 'helmet-red',
        level: 1
    });
});

test('Duel resolver supports dashboard fallback, cached socket identity and unauthenticated sockets', async () => {
    assert.equal(await resolveDuelAuthUser(), null);
    const dashboardCalls = [];
    const dashboardIdentity = await resolveDuelAuthUser({
        authUser: { id: 9, username: 'Legacy', avatarKey: 'helmet-white', level: 2 },
        accountStatsService: {
            async getAccountDashboard(userId, options) {
                dashboardCalls.push({ userId, options });
                return { progress: { level: 11 } };
            }
        }
    });
    assert.deepEqual(dashboardCalls, [{ userId: 9, options: { historyLimit: 1 } }]);
    assert.equal(dashboardIdentity.level, 11);

    const socket = {
        user: { id: 10, username: 'Socket User', avatarKey: 'helmet-green', level: 3 }
    };
    const socketIdentity = await resolveSocketDuelAuthUser(socket);
    assert.deepEqual(socket.data.duelIdentity, socketIdentity);
    assert.equal(socketIdentity.level, 3);
    assert.equal(await resolveSocketDuelAuthUser(null), null);
});
