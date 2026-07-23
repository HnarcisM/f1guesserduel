const test = require('node:test');
const assert = require('node:assert/strict');

const { createRedisSocketAdapter } = require('../server/socket/redisSocketAdapter');

function createRedisDuplicate(role) {
    const listeners = new Map();
    return {
        role,
        isOpen: false,
        connectCalls: 0,
        quitCalls: 0,
        on(eventName, handler) {
            listeners.set(eventName, handler);
        },
        async connect() {
            this.connectCalls += 1;
            this.isOpen = true;
        },
        async quit() {
            this.quitCalls += 1;
            this.isOpen = false;
        },
        emitError(error) {
            listeners.get('error')?.(error);
        }
    };
}

test('Socket.IO Redis adapter uses isolated publisher and subscriber clients', async () => {
    const duplicates = [createRedisDuplicate('publisher'), createRedisDuplicate('subscriber')];
    const redisClient = {
        duplicateCalls: 0,
        duplicate() {
            const duplicate = duplicates[this.duplicateCalls];
            this.duplicateCalls += 1;
            return duplicate;
        }
    };
    const adapterCalls = [];
    const io = {
        adapter(value) {
            adapterCalls.push(value);
        }
    };
    const factoryCalls = [];

    const adapter = await createRedisSocketAdapter({
        io,
        redisClient,
        keyPrefix: 'f1:test',
        requestsTimeoutMs: 7_000,
        logger: { info() {}, error() {} },
        adapterFactory(pubClient, subClient, options) {
            factoryCalls.push({ pubClient, subClient, options });
            return { pubClient, subClient, options };
        }
    });

    assert.equal(redisClient.duplicateCalls, 2);
    assert.equal(duplicates[0].connectCalls, 1);
    assert.equal(duplicates[1].connectCalls, 1);
    assert.equal(factoryCalls.length, 1);
    assert.deepEqual(factoryCalls[0].options, {
        key: 'f1:test:socket.io',
        requestsTimeout: 7_000,
        publishOnSpecificResponseChannel: true
    });
    assert.equal(adapterCalls.length, 1);
    assert.equal(adapter.provider, 'redis');

    await adapter.close();
    await adapter.close();
    assert.equal(duplicates[0].quitCalls, 1);
    assert.equal(duplicates[1].quitCalls, 1);
});

test('Socket.IO Redis adapter closes partial clients when initialization fails', async () => {
    const duplicates = [createRedisDuplicate('publisher'), createRedisDuplicate('subscriber')];
    duplicates[1].connect = async function connect() {
        this.connectCalls += 1;
        throw new Error('Redis subscriber unavailable');
    };
    const redisClient = {
        duplicateCalls: 0,
        duplicate() {
            return duplicates[this.duplicateCalls++];
        }
    };

    await assert.rejects(
        createRedisSocketAdapter({
            io: { adapter() {} },
            redisClient,
            logger: { info() {}, error() {} },
            adapterFactory() {
                return {};
            }
        }),
        /Redis subscriber unavailable/
    );

    assert.equal(duplicates[0].quitCalls, 1);
    assert.equal(duplicates[1].quitCalls, 0);
});

test('Socket.IO Redis adapter validates its required dependencies', async () => {
    await assert.rejects(
        createRedisSocketAdapter({ io: null, redisClient: {} }),
        /Socket.IO server instance/
    );
    await assert.rejects(
        createRedisSocketAdapter({ io: { adapter() {} }, redisClient: {} }),
        /duplicate support/
    );
    await assert.rejects(
        createRedisSocketAdapter({
            io: { adapter() {} },
            redisClient: { duplicate() {} },
            requestsTimeoutMs: 0
        }),
        /positive number/
    );
});
