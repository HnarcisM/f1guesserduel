const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createErrorMiddleware,
    createErrorPayload,
    normalizeStatusCode
} = require('../server/middleware/errorMiddleware');

function createMockResponse() {
    return {
        statusCode: 200,
        body: null,
        headersSent: false,
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

test('normalizeStatusCode falls back to 500 for invalid values', () => {
    assert.equal(normalizeStatusCode({ status: 418 }), 418);
    assert.equal(normalizeStatusCode({ statusCode: 404 }), 404);
    assert.equal(normalizeStatusCode({ status: 200 }), 500);
    assert.equal(normalizeStatusCode({}), 500);
});

test('error payload hides internal 500 messages in production', () => {
    const error = new Error('Database exploded');
    const result = createErrorPayload(error, { isProduction: true });

    assert.equal(result.statusCode, 500);
    assert.deepEqual(result.payload, {
        message: 'A apărut o eroare internă. Încearcă din nou mai târziu.'
    });
});

test('error payload keeps validation messages for 4xx errors', () => {
    const error = new Error('Request invalid pentru test.');
    error.status = 400;

    const result = createErrorPayload(error, { isProduction: true });

    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.payload, {
        message: 'Request invalid pentru test.'
    });
});

test('error middleware handles invalid JSON parse errors as bad requests', () => {
    const error = new SyntaxError('Unexpected token');
    error.status = 400;
    error.type = 'entity.parse.failed';

    const middleware = createErrorMiddleware({
        isProduction: false,
        logger: { error() {} }
    });
    const res = createMockResponse();
    let nextCalled = false;

    middleware(error, {}, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Body-ul requestului nu conține JSON valid.');
    assert.equal(res.body.code, 'entity.parse.failed');
});

test('error middleware delegates when headers were already sent', () => {
    const middleware = createErrorMiddleware({ logger: { error() {} } });
    const res = createMockResponse();
    const error = new Error('late error');
    let delegatedError = null;

    res.headersSent = true;
    middleware(error, {}, res, nextError => {
        delegatedError = nextError;
    });

    assert.equal(delegatedError, error);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, null);
});
