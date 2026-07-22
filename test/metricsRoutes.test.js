const test = require('node:test');
const assert = require('node:assert/strict');

const {
    extractBearerToken,
    tokensMatch,
    createMetricsHandler
} = require('../server/routes/metricsRoutes');

function createRequest(authorization = null) {
    return {
        get(name) {
            return name === 'authorization' ? authorization : null;
        }
    };
}

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        type(value) {
            this.headers['Content-Type'] = value;
            return this;
        },
        status(value) {
            this.statusCode = value;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        },
        send(value) {
            this.body = value;
            return this;
        },
        sendStatus(value) {
            this.statusCode = value;
            this.body = String(value);
            return this;
        }
    };
}

test('metrics bearer parser is strict and token comparison is timing-safe compatible', () => {
    assert.equal(extractBearerToken('Bearer secret-token'), 'secret-token');
    assert.equal(extractBearerToken('bearer secret-token'), null);
    assert.equal(extractBearerToken('Bearer secret token'), null);
    assert.equal(tokensMatch('same-token', 'same-token'), true);
    assert.equal(tokensMatch('short', 'different-length'), false);
    assert.equal(tokensMatch(null, 'token'), false);
});

test('metrics endpoint stays hidden while disabled', async () => {
    const handler = createMetricsHandler({ enabled: false });
    const res = createResponse();

    await handler(createRequest(), res, assert.fail);

    assert.equal(res.statusCode, 404);
    assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('metrics endpoint rejects missing and invalid bearer tokens', async () => {
    const operationalMetrics = {
        enabled: true,
        contentType: 'text/plain',
        async metrics() {
            assert.fail('Metrics must not be rendered for unauthorized requests.');
        }
    };
    const handler = createMetricsHandler({
        enabled: true,
        token: 'expected-token',
        operationalMetrics
    });

    for (const authorization of [null, 'Bearer wrong-token']) {
        const res = createResponse();
        await handler(createRequest(authorization), res, assert.fail);
        assert.equal(res.statusCode, 401);
        assert.equal(res.headers['WWW-Authenticate'], 'Bearer realm="metrics"');
        assert.deepEqual(res.body, { message: 'Unauthorized.' });
    }
});

test('metrics endpoint returns Prometheus content only for the configured token', async () => {
    const operationalMetrics = {
        enabled: true,
        contentType: 'text/plain; version=0.0.4',
        async metrics() {
            return '# HELP f1guesser_rooms_current Current rooms\n';
        }
    };
    const handler = createMetricsHandler({
        enabled: true,
        token: 'expected-token',
        operationalMetrics
    });
    const res = createResponse();

    await handler(createRequest('Bearer expected-token'), res, assert.fail);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['Content-Type'], 'text/plain; version=0.0.4');
    assert.match(res.body, /f1guesser_rooms_current/);
});

test('metrics endpoint forwards registry failures to Express error handling', async () => {
    const expectedError = new Error('registry failed');
    const handler = createMetricsHandler({
        enabled: true,
        token: 'expected-token',
        operationalMetrics: {
            enabled: true,
            contentType: 'text/plain',
            async metrics() {
                throw expectedError;
            }
        }
    });
    const res = createResponse();
    let forwardedError = null;

    await handler(createRequest('Bearer expected-token'), res, error => {
        forwardedError = error;
    });

    assert.equal(forwardedError, expectedError);
});
