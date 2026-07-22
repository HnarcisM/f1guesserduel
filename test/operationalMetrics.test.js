const test = require('node:test');
const assert = require('node:assert/strict');

const { createOperationalMetrics } = require('../server/metrics/operationalMetrics');

test('operational metrics aggregate rooms, members and bounded lifecycle events', async () => {
    const metrics = createOperationalMetrics({ includeProcessMetrics: false });
    metrics.setRoomStore({
        values() {
            return [
                {
                    inactiveSince: null,
                    players: { one: { connected: true }, two: { connected: false } },
                    spectators: { three: { connected: true } }
                },
                { inactiveSince: 123, players: {}, spectators: {} }
            ];
        }
    });
    metrics.recordRoomEvent('created');
    metrics.recordRoomEvent('inactive_cleanup', 2);
    metrics.recordReconnect({ outcome: 'disconnected', role: 'player' });
    metrics.recordReconnect({ outcome: 'restored', role: 'player', durationMs: 1500 });

    const output = await metrics.metrics();

    assert.match(metrics.contentType, /application\/openmetrics-text/);
    assert.match(output, /# EOF\n$/);
    assert.match(output, /f1guesser_rooms_current\{state="active"\} 1/);
    assert.match(output, /f1guesser_rooms_current\{state="inactive"\} 1/);
    assert.match(output, /f1guesser_room_members_current\{role="player",connection="connected"\} 1/);
    assert.match(output, /f1guesser_room_members_current\{role="player",connection="disconnected"\} 1/);
    assert.match(output, /f1guesser_room_events_total\{event="created"\} 1/);
    assert.match(output, /f1guesser_room_events_total\{event="inactive_cleanup"\} 2/);
    assert.match(output, /f1guesser_reconnect_events_total\{outcome="restored",role="player"\} 1/);
    assert.match(output, /f1guesser_reconnect_duration_seconds_sum\{outcome="restored",role="player"\} 1\.5/);
});

test('operational metrics expose dependency, pool and rate-limit aggregates without dynamic identities', async () => {
    const metrics = createOperationalMetrics({ includeProcessMetrics: false });
    metrics.setDatabase({
        provider: 'postgres',
        pool: { totalCount: 4, idleCount: 3, waitingCount: 1 }
    });
    metrics.setRedisClient({ isReady: true });
    metrics.recordRateLimit({ channel: 'http', provider: 'redis', outcome: 'blocked' });
    metrics.recordRateLimit({ channel: 'socket', provider: 'memory', outcome: 'fallback_allowed' });
    metrics.recordDependencyOperation({
        dependency: 'postgres',
        operation: 'query',
        outcome: 'success',
        duration: 0.02
    });

    const result = await metrics.observeDependencyOperation('redis', 'health_check', async () => 'PONG');
    const output = await metrics.metrics();

    assert.equal(result, 'PONG');
    assert.match(output, /f1guesser_dependency_up\{dependency="postgres"\} 1/);
    assert.match(output, /f1guesser_dependency_up\{dependency="redis"\} 1/);
    assert.match(output, /f1guesser_postgres_pool_connections\{state="total"\} 4/);
    assert.match(output, /f1guesser_postgres_pool_connections\{state="idle"\} 3/);
    assert.match(output, /f1guesser_postgres_pool_connections\{state="waiting"\} 1/);
    assert.match(output, /f1guesser_rate_limit_decisions_total\{channel="http",provider="redis",outcome="blocked"\} 1/);
    assert.match(output, /f1guesser_dependency_operations_total\{dependency="redis",operation="health_check",outcome="success"\} 1/);
    assert.doesNotMatch(output, /roomId|username|socketId/);
});

test('dependency failures are counted and rethrown', async () => {
    const metrics = createOperationalMetrics({ includeProcessMetrics: false });
    const expectedError = new Error('Redis unavailable');

    await assert.rejects(
        metrics.observeDependencyOperation('redis', 'room_persist', async () => {
            throw expectedError;
        }),
        error => error === expectedError
    );

    const output = await metrics.metrics();
    assert.match(output, /f1guesser_dependency_operations_total\{dependency="redis",operation="room_persist",outcome="error"\} 1/);
});

test('disabled metrics add no collection overhead and still execute observed work', async () => {
    const metrics = createOperationalMetrics({ enabled: false });
    let calls = 0;
    const result = await metrics.observeDependencyOperation('redis', 'connect', async () => {
        calls += 1;
        return 'connected';
    });

    assert.equal(metrics.enabled, false);
    assert.equal(result, 'connected');
    assert.equal(calls, 1);
    assert.equal(await metrics.metrics(), '');
});
