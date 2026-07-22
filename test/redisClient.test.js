const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createReconnectStrategy,
    createRedisClient,
    closeRedisClient
} = require('../server/redis/redisClient');

test('Redis client uses bounded connection retries and does not log its URL', async () => {
    const factoryCalls = [];
    const logs = [];
    const handlers = new Map();
    const fakeClient = {
        isOpen: true,
        connectCalls: 0,
        quitCalls: 0,
        on(eventName, handler) {
            handlers.set(eventName, handler);
        },
        async connect() {
            this.connectCalls += 1;
        },
        async quit() {
            this.quitCalls += 1;
            this.isOpen = false;
        }
    };

    const client = await createRedisClient({
        url: 'rediss://default:secret@redis.example.com:6379',
        connectTimeoutMs: 12_000,
        clientFactory(options) {
            factoryCalls.push(options);
            return fakeClient;
        },
        logger: {
            info(message, metadata) {
                logs.push({ message, metadata });
            },
            error(message, metadata) {
                logs.push({ message, metadata });
            }
        }
    });

    assert.equal(client, fakeClient);
    assert.equal(fakeClient.connectCalls, 1);
    assert.equal(factoryCalls[0].socket.connectTimeout, 12_000);
    assert.equal(factoryCalls[0].socket.reconnectStrategy(0), 250);
    assert.equal(factoryCalls[0].socket.reconnectStrategy(2), 1000);
    assert.match(factoryCalls[0].socket.reconnectStrategy(3).message, /after 3 retries/);
    assert.equal(JSON.stringify(logs).includes('secret'), false);

    const runtimeError = new Error('connection lost');
    handlers.get('error')(runtimeError);
    assert.equal(logs.at(-1).metadata.error, runtimeError);

    await closeRedisClient(fakeClient);
    assert.equal(fakeClient.quitCalls, 1);
});

test('Redis client reports connection timing and runtime errors without its URL', async () => {
    const observed = [];
    const recorded = [];
    let errorHandler = null;
    const metrics = {
        async observeDependencyOperation(dependency, operation, callback) {
            observed.push({ dependency, operation });
            return callback();
        },
        recordDependencyOperation(event) {
            recorded.push(event);
        }
    };

    await createRedisClient({
        url: 'rediss://default:secret@redis.example.com:6379',
        clientFactory() {
            return {
                on(eventName, handler) {
                    if (eventName === 'error') errorHandler = handler;
                },
                async connect() {}
            };
        },
        logger: { info() {}, error() {} },
        metrics
    });
    errorHandler(new Error('connection lost'));

    assert.deepEqual(observed, [{ dependency: 'redis', operation: 'connect' }]);
    assert.deepEqual(recorded, [{
        dependency: 'redis',
        operation: 'client_event',
        outcome: 'error'
    }]);
    assert.equal(JSON.stringify({ observed, recorded }).includes('secret'), false);
});

test('Redis reconnect strategy stops after its configured retry count', () => {
    const strategy = createReconnectStrategy(2);

    assert.equal(strategy(0), 250);
    assert.equal(strategy(1), 500);
    assert.ok(strategy(2) instanceof Error);
});

test('Redis client destroys its resources when the initial connection fails', async () => {
    const expectedError = new Error('connect timeout');
    let destroyCalls = 0;

    await assert.rejects(createRedisClient({
        url: 'redis://redis.example.com:6379',
        clientFactory() {
            return {
                on() {},
                async connect() {
                    throw expectedError;
                },
                destroy() {
                    destroyCalls += 1;
                }
            };
        },
        logger: { info() {}, error() {} }
    }), error => error === expectedError);

    assert.equal(destroyCalls, 1);
});
