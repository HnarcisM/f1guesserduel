const assert = require('node:assert/strict');
const test = require('node:test');

const {
    noStoreResponse,
    setNoStoreHeader
} = require('../server/middleware/noStoreResponse');

test('no-store middleware disables HTTP caching before continuing', () => {
    const headers = {};
    let nextCalled = false;
    const res = {
        set(name, value) {
            headers[name] = value;
        }
    };

    noStoreResponse({}, res, () => {
        nextCalled = true;
    });

    assert.equal(headers['Cache-Control'], 'no-store');
    assert.equal(nextCalled, true);
});

test('no-store header helper also supports Node setHeader responses', () => {
    const headers = {};
    setNoStoreHeader({
        setHeader(name, value) {
            headers[name] = value;
        }
    });

    assert.equal(headers['Cache-Control'], 'no-store');
});
