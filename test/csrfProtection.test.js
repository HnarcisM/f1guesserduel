const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createCsrfProtectionMiddleware,
    getRequestSourceOrigin,
    normalizeConfiguredOrigin
} = require('../server/middleware/csrfProtection');

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

function runMiddleware(middleware, { method = 'PATCH', headers = {} } = {}) {
    const normalizedHeaders = Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
    );
    const req = {
        method,
        headers: normalizedHeaders,
        get(name) {
            return normalizedHeaders[String(name).toLowerCase()];
        }
    };
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => {
        nextCalled = true;
    });

    return { nextCalled, res };
}

const allowedOrigins = [
    'https://f1guesserduel.onrender.com',
    'https://preview.example.com'
];

test('CSRF protection allows safe HTTP methods without origin headers', () => {
    const middleware = createCsrfProtectionMiddleware({ allowedOrigins });

    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        const result = runMiddleware(middleware, { method });
        assert.equal(result.nextCalled, true, method);
        assert.equal(result.res.statusCode, 200, method);
    }
});

test('CSRF protection allows an exact configured Origin', () => {
    const middleware = createCsrfProtectionMiddleware({ allowedOrigins });
    const result = runMiddleware(middleware, {
        headers: {
            Origin: 'https://f1guesserduel.onrender.com',
            'Sec-Fetch-Site': 'same-origin'
        }
    });

    assert.equal(result.nextCalled, true);
    assert.equal(result.res.statusCode, 200);
});

test('CSRF protection accepts Referer only as a fallback source', () => {
    const middleware = createCsrfProtectionMiddleware({ allowedOrigins });
    const result = runMiddleware(middleware, {
        method: 'POST',
        headers: { Referer: 'https://preview.example.com/account/settings?tab=security' }
    });

    assert.equal(result.nextCalled, true);
    assert.equal(getRequestSourceOrigin({
        headers: { referer: 'https://preview.example.com/account/settings' }
    }), 'https://preview.example.com');
});

test('CSRF protection rejects cross-site requests before trusting their Origin', () => {
    const middleware = createCsrfProtectionMiddleware({ allowedOrigins });
    const result = runMiddleware(middleware, {
        method: 'POST',
        headers: {
            Origin: 'https://f1guesserduel.onrender.com',
            'Sec-Fetch-Site': 'cross-site'
        }
    });

    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
    assert.equal(result.res.headers['Cache-Control'], 'no-store');
    assert.match(result.res.body.message, /CSRF/);
});

test('CSRF protection rejects untrusted, missing, null and malformed origins', () => {
    const middleware = createCsrfProtectionMiddleware({ allowedOrigins });
    const requests = [
        { Origin: 'https://evil.example' },
        {},
        { Origin: 'null' },
        { Origin: 'https://f1guesserduel.onrender.com/forged-path' },
        { Referer: 'not-a-url' }
    ];

    for (const headers of requests) {
        const result = runMiddleware(middleware, { headers });
        assert.equal(result.nextCalled, false, JSON.stringify(headers));
        assert.equal(result.res.statusCode, 403, JSON.stringify(headers));
    }
});

test('CSRF protection never lets Referer override an explicit untrusted Origin', () => {
    const middleware = createCsrfProtectionMiddleware({ allowedOrigins });
    const result = runMiddleware(middleware, {
        headers: {
            Origin: 'https://evil.example',
            Referer: 'https://f1guesserduel.onrender.com/account'
        }
    });

    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
});

test('CSRF allowed origins are normalized strictly during startup', () => {
    assert.equal(
        normalizeConfiguredOrigin('https://Example.com:443'),
        'https://example.com'
    );
    assert.throws(
        () => createCsrfProtectionMiddleware({ allowedOrigins: ['https://example.com/path'] }),
        /Invalid CSRF allowed origin/
    );
    assert.throws(
        () => createCsrfProtectionMiddleware({ allowedOrigins: ['javascript:alert(1)'] }),
        /Invalid CSRF allowed origin/
    );
});
