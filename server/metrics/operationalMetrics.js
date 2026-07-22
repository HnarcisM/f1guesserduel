const METRIC_PREFIX = 'f1guesser_';
const OPENMETRICS_CONTENT_TYPE = 'application/openmetrics-text; version=1.0.0; charset=utf-8';
const ROOM_EVENTS = new Set(['created', 'removed', 'inactive_cleanup']);
const RECONNECT_OUTCOMES = new Set(['disconnected', 'restored', 'grace_expired']);
const MEMBER_ROLES = new Set(['player', 'spectator']);
const RATE_LIMIT_CHANNELS = new Set(['http', 'socket']);
const RATE_LIMIT_PROVIDERS = new Set(['memory', 'redis', 'external']);
const RATE_LIMIT_OUTCOMES = new Set(['allowed', 'blocked', 'fallback_allowed', 'fallback_blocked']);
const DEPENDENCY_OPERATIONS = Object.freeze({
    redis: new Set(['connect', 'client_event', 'health_check', 'room_restore', 'room_persist', 'rate_limit', 'shutdown']),
    postgres: new Set(['connect', 'migrate', 'query', 'pool_event', 'health_check', 'shutdown'])
});

function normalizeLabel(value, allowedValues, fallback = 'other') {
    return allowedValues.has(value) ? value : fallback;
}

function durationSeconds(startedAt) {
    return Number(process.hrtime.bigint() - startedAt) / 1e9;
}

function createDisabledMetrics() {
    return {
        enabled: false,
        contentType: OPENMETRICS_CONTENT_TYPE,
        setRoomStore() {},
        setDatabase() {},
        setRedisClient() {},
        recordRoomEvent() {},
        recordReconnect() {},
        recordRateLimit() {},
        recordDependencyOperation() {},
        async observeDependencyOperation(_dependency, _operation, callback) {
            return callback();
        },
        async metrics() {
            return '';
        }
    };
}

function createOperationalMetrics({
    enabled = true,
    includeProcessMetrics = true,
    registry = null
} = {}) {
    if (!enabled) return createDisabledMetrics();

    const {
        Registry,
        Counter,
        Gauge,
        Histogram,
        collectDefaultMetrics
    } = require('prom-client');

    const metricsRegistry = registry || new Registry();
    metricsRegistry.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);
    let roomStore = null;
    let database = null;
    let redisClient = null;

    if (includeProcessMetrics) {
        collectDefaultMetrics({
            register: metricsRegistry,
            prefix: METRIC_PREFIX
        });
    }

    const roomCount = new Gauge({
        name: `${METRIC_PREFIX}rooms_current`,
        help: 'Current Duel rooms grouped by activity state.',
        labelNames: ['state'],
        registers: [metricsRegistry],
        collect() {
            this.reset();
            const rooms = roomStore?.values?.() || [];
            let active = 0;
            let inactive = 0;
            for (const room of rooms) {
                if (Number.isFinite(room?.inactiveSince)) inactive += 1;
                else active += 1;
            }
            this.set({ state: 'active' }, active);
            this.set({ state: 'inactive' }, inactive);
        }
    });

    const roomMembers = new Gauge({
        name: `${METRIC_PREFIX}room_members_current`,
        help: 'Current Duel members grouped by role and connection state.',
        labelNames: ['role', 'connection'],
        registers: [metricsRegistry],
        collect() {
            this.reset();
            const counts = new Map();
            for (const role of MEMBER_ROLES) {
                counts.set(`${role}:connected`, 0);
                counts.set(`${role}:disconnected`, 0);
            }
            for (const room of roomStore?.values?.() || []) {
                for (const [role, members] of [
                    ['player', Object.values(room?.players || {})],
                    ['spectator', Object.values(room?.spectators || {})]
                ]) {
                    for (const member of members) {
                        const connection = member?.connected === false ? 'disconnected' : 'connected';
                        const key = `${role}:${connection}`;
                        counts.set(key, counts.get(key) + 1);
                    }
                }
            }
            for (const [key, value] of counts) {
                const [role, connection] = key.split(':');
                this.set({ role, connection }, value);
            }
        }
    });

    const roomEvents = new Counter({
        name: `${METRIC_PREFIX}room_events_total`,
        help: 'Duel room lifecycle events.',
        labelNames: ['event'],
        registers: [metricsRegistry]
    });

    const reconnects = new Counter({
        name: `${METRIC_PREFIX}reconnect_events_total`,
        help: 'Duel member disconnect, reconnect and grace-expiry events.',
        labelNames: ['outcome', 'role'],
        registers: [metricsRegistry]
    });

    const reconnectDuration = new Histogram({
        name: `${METRIC_PREFIX}reconnect_duration_seconds`,
        help: 'Time between a Duel member disconnect and reconnect or grace expiry.',
        labelNames: ['outcome', 'role'],
        buckets: [0.25, 1, 5, 15, 30, 60, 120],
        registers: [metricsRegistry]
    });

    const rateLimits = new Counter({
        name: `${METRIC_PREFIX}rate_limit_decisions_total`,
        help: 'HTTP and Socket.IO rate limit decisions.',
        labelNames: ['channel', 'provider', 'outcome'],
        registers: [metricsRegistry]
    });

    const dependencyOperations = new Counter({
        name: `${METRIC_PREFIX}dependency_operations_total`,
        help: 'Redis and PostgreSQL operations grouped by bounded operation and outcome.',
        labelNames: ['dependency', 'operation', 'outcome'],
        registers: [metricsRegistry]
    });

    const dependencyDuration = new Histogram({
        name: `${METRIC_PREFIX}dependency_operation_duration_seconds`,
        help: 'Redis and PostgreSQL operation duration.',
        labelNames: ['dependency', 'operation'],
        buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
        registers: [metricsRegistry]
    });

    const dependencyUp = new Gauge({
        name: `${METRIC_PREFIX}dependency_up`,
        help: 'Whether an optional external dependency is currently available.',
        labelNames: ['dependency'],
        registers: [metricsRegistry],
        collect() {
            this.reset();
            this.set({ dependency: 'postgres' }, database?.provider === 'postgres' ? 1 : 0);
            this.set({ dependency: 'redis' }, redisClient?.isReady === true || redisClient?.isOpen === true ? 1 : 0);
        }
    });

    const postgresPoolConnections = new Gauge({
        name: `${METRIC_PREFIX}postgres_pool_connections`,
        help: 'PostgreSQL pool connections grouped by state.',
        labelNames: ['state'],
        registers: [metricsRegistry],
        collect() {
            this.reset();
            const pool = database?.provider === 'postgres' ? database.pool : null;
            this.set({ state: 'total' }, Number(pool?.totalCount) || 0);
            this.set({ state: 'idle' }, Number(pool?.idleCount) || 0);
            this.set({ state: 'waiting' }, Number(pool?.waitingCount) || 0);
        }
    });

    function recordReconnect({ outcome, role, durationMs = null } = {}) {
        const safeOutcome = normalizeLabel(outcome, RECONNECT_OUTCOMES);
        const safeRole = normalizeLabel(role, MEMBER_ROLES);
        reconnects.inc({ outcome: safeOutcome, role: safeRole });
        if (safeOutcome !== 'disconnected' && Number.isFinite(durationMs) && durationMs >= 0) {
            reconnectDuration.observe({ outcome: safeOutcome, role: safeRole }, durationMs / 1000);
        }
    }

    function recordDependencyOperation({ dependency, operation, outcome = 'success', duration = null } = {}) {
        const allowedOperations = DEPENDENCY_OPERATIONS[dependency];
        if (!allowedOperations) return;
        const safeOperation = normalizeLabel(operation, allowedOperations);
        const safeOutcome = outcome === 'error' ? 'error' : 'success';
        dependencyOperations.inc({ dependency, operation: safeOperation, outcome: safeOutcome });
        if (Number.isFinite(duration) && duration >= 0) {
            dependencyDuration.observe({ dependency, operation: safeOperation }, duration);
        }
    }

    async function observeDependencyOperation(dependency, operation, callback) {
        const startedAt = process.hrtime.bigint();
        try {
            const result = await callback();
            recordDependencyOperation({
                dependency,
                operation,
                outcome: 'success',
                duration: durationSeconds(startedAt)
            });
            return result;
        } catch (error) {
            recordDependencyOperation({
                dependency,
                operation,
                outcome: 'error',
                duration: durationSeconds(startedAt)
            });
            throw error;
        }
    }

    return {
        enabled: true,
        contentType: metricsRegistry.contentType,
        setRoomStore(value) {
            roomStore = value;
        },
        setDatabase(value) {
            database = value;
        },
        setRedisClient(value) {
            redisClient = value;
        },
        recordRoomEvent(event, count = 1) {
            roomEvents.inc({ event: normalizeLabel(event, ROOM_EVENTS) }, count);
        },
        recordReconnect,
        recordRateLimit({ channel, provider, outcome } = {}) {
            rateLimits.inc({
                channel: normalizeLabel(channel, RATE_LIMIT_CHANNELS),
                provider: normalizeLabel(provider, RATE_LIMIT_PROVIDERS),
                outcome: normalizeLabel(outcome, RATE_LIMIT_OUTCOMES)
            });
        },
        recordDependencyOperation,
        observeDependencyOperation,
        metrics() {
            return metricsRegistry.metrics();
        }
    };
}

module.exports = {
    METRIC_PREFIX,
    createOperationalMetrics
};
