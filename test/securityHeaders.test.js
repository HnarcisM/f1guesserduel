const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createContentSecurityPolicyDirectives,
    createSecurityHeadersMiddleware
} = require('../server/middleware/securityHeaders');

function createMockRequest() {
    return {
        method: 'GET',
        url: '/',
        headers: {},
        app: {
            get() {
                return false;
            }
        }
    };
}

function createMockResponse() {
    return {
        headers: {},
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        getHeader(name) {
            return this.headers[name.toLowerCase()];
        },
        removeHeader(name) {
            delete this.headers[name.toLowerCase()];
        }
    };
}

function runMiddleware(middleware, req = createMockRequest(), res = createMockResponse()) {
    return new Promise((resolve, reject) => {
        middleware(req, res, error => {
            if (error) reject(error);
            else resolve(res);
        });
    });
}

test('security CSP keeps scripts local and allows Socket.IO websocket connections', () => {
    const directives = createContentSecurityPolicyDirectives({ isProduction: false });

    assert.deepEqual(directives.defaultSrc, ["'self'"]);
    assert.deepEqual(directives.scriptSrc, ["'self'"]);
    assert.deepEqual(directives.scriptSrcAttr, ["'none'"]);
    assert.deepEqual(directives.connectSrc, ["'self'", 'ws:', 'wss:']);
    assert.deepEqual(directives.imgSrc, ["'self'", 'data:']);
    assert.deepEqual(directives.objectSrc, ["'none'"]);
    assert.deepEqual(directives.frameAncestors, ["'none'"]);
});

test('security CSP keeps inline styles enabled for dynamic progress and timer UI only', () => {
    const directives = createContentSecurityPolicyDirectives({ isProduction: false });

    assert.deepEqual(directives.styleSrc, ["'self'", "'unsafe-inline'"]);
    assert.equal(directives.upgradeInsecureRequests, null);
});

test('security middleware sets production headers without exposing powered-by', async () => {
    const middleware = createSecurityHeadersMiddleware({ isProduction: true });
    const res = await runMiddleware(middleware);

    const csp = res.headers['content-security-policy'];

    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /connect-src 'self' ws: wss:/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /script-src-attr 'none'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.match(csp, /img-src 'self' data:/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /upgrade-insecure-requests/);
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['strict-transport-security'], 'max-age=15552000; includeSubDomains');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
});

test('security middleware avoids HSTS and HTTPS upgrades during local development', async () => {
    const middleware = createSecurityHeadersMiddleware({ isProduction: false });
    const res = await runMiddleware(middleware);

    assert.equal(res.headers['strict-transport-security'], undefined);
    assert.doesNotMatch(res.headers['content-security-policy'], /upgrade-insecure-requests/);
});
