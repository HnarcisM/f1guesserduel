const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createHealthPayload,
    createHealthHandler,
    createHealthChecks,
    normalizeCheckResult,
    resolveHealthChecks
} = require('../server/routes/healthRoutes');

function createMockResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

test('health payload reports ok status with uptime and timestamp', async () => {
    const payload = await createHealthPayload({
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        getUptime: () => 42.9
    });

    assert.deepEqual(payload, {
        status: 'ok',
        uptimeSeconds: 42,
        timestamp: '2026-07-01T12:00:00.000Z'
    });
});

test('health payload can expose non-sensitive app metadata and persistence mode', async () => {
    const payload = await createHealthPayload({
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        getUptime: () => 1,
        appVersion: '1.2.3',
        nodeEnv: 'production',
        persistenceMode: 'ephemeral'
    });

    assert.equal(payload.version, '1.2.3');
    assert.equal(payload.nodeEnv, 'production');
    assert.deepEqual(payload.persistence, {
        mode: 'ephemeral'
    });
    assert.equal(Object.hasOwn(payload, 'dataDir'), false);
});

test('health payload includes dependency checks', async () => {
    const payload = await createHealthPayload({
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        getUptime: () => 10,
        checks: {
            database: () => ({ status: 'ok' }),
            drivers: async () => ({ status: 'ok', count: 166 })
        }
    });

    assert.equal(payload.status, 'ok');
    assert.deepEqual(payload.checks.database, { status: 'ok' });
    assert.deepEqual(payload.checks.drivers, { status: 'ok', count: 166 });
});

test('health payload becomes degraded when a dependency check fails', async () => {
    const payload = await createHealthPayload({
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        getUptime: () => 10,
        checks: {
            database: () => {
                throw new Error('database unavailable');
            }
        }
    });

    assert.equal(payload.status, 'degraded');
    assert.equal(payload.checks.database.status, 'error');
    assert.equal(payload.checks.database.message, 'Health check failed.');
});

test('health handler responds with no-store cache headers', async () => {
    const res = createMockResponse();
    const handler = createHealthHandler({
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        getUptime: () => 10
    });

    await handler({}, res, error => {
        throw error;
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.uptimeSeconds, 10);
});

test('health handler returns 503 when checks are degraded', async () => {
    const res = createMockResponse();
    const handler = createHealthHandler({
        clock: () => new Date('2026-07-01T12:00:00.000Z'),
        getUptime: () => 10,
        checks: {
            database: () => ({ status: 'error', message: 'down' })
        }
    });

    await handler({}, res, error => {
        throw error;
    });

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.status, 'degraded');
});

test('health checks report database, drivers and room store status without sensitive paths', async () => {
    const db = {
        prepare(sql) {
            assert.equal(sql, 'SELECT 1 AS ok');
            return { get: () => ({ ok: 1 }) };
        }
    };
    const driversRepository = {
        getAllDrivers: () => [{ id: 'senna' }, { id: 'prost' }]
    };
    const roomStore = {
        values: () => [{ roomId: 'ABC123' }],
        getLastSaveError: () => null
    };

    const checks = createHealthChecks({ db, driversRepository, roomStore });
    const resolved = await resolveHealthChecks(checks);

    assert.deepEqual(resolved.database, { status: 'ok' });
    assert.deepEqual(resolved.drivers, { status: 'ok', count: 2 });
    assert.deepEqual(resolved.rooms, {
        status: 'ok',
        activeRooms: 1,
        persistence: 'ok'
    });
    assert.equal(JSON.stringify(resolved).includes('ABC123'), false);
});

test('health room check reports persistence error without stack or paths', async () => {
    const roomStore = {
        values: () => [],
        getLastSaveError: () => {
            const error = new Error('EACCES: permission denied, open /tmp/f1guesserduel/rooms.json');
            error.path = '/tmp/f1guesserduel/rooms.json';
            return error;
        }
    };

    const checks = createHealthChecks({ roomStore });
    const resolved = await resolveHealthChecks(checks);

    assert.equal(resolved.rooms.status, 'error');
    assert.equal(resolved.rooms.persistence, 'error');
    assert.equal(Object.hasOwn(resolved.rooms, 'path'), false);
    assert.equal(Object.hasOwn(resolved.rooms, 'stack'), false);
});

test('normalizeCheckResult removes sensitive diagnostic fields', () => {
    const normalized = normalizeCheckResult({
        status: 'ok',
        path: '/tmp/private.sqlite',
        filePath: '/tmp/private.sqlite',
        stack: 'stack',
        detail: 'safe'
    });

    assert.deepEqual(normalized, {
        status: 'ok',
        detail: 'safe'
    });
});
