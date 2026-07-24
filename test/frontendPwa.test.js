const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const serviceWorker = require('../public/service-worker.js');
const pwaModulePromise = import('../public/js/pwaController.js');

function readPngDimensions(filePath) {
    const buffer = fs.readFileSync(filePath);
    assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
    };
}

function createWindow({ secure = true, hostname = 'example.test', readyState = 'complete' } = {}) {
    const listeners = new Map();
    const events = [];
    class CustomEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    }
    return {
        document: { readyState },
        isSecureContext: secure,
        location: { hostname },
        navigator: null,
        CustomEvent,
        events,
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        dispatchEvent(event) {
            events.push(event);
            return true;
        },
        dispatch(type) {
            for (const handler of listeners.get(type) || []) handler({ type });
        }
    };
}

test('PWA manifest is installable and references valid 192px and 512px icons', () => {
    const manifestPath = path.join(projectRoot, 'public', 'manifest.webmanifest');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(manifest.id, '/');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color, '#d61220');
    assert.equal(manifest.background_color, '#0f1116');
    assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
    assert.ok(manifest.icons.every(icon => icon.type === 'image/png'));
    assert.ok(manifest.icons.every(icon => icon.purpose.includes('maskable')));

    assert.deepEqual(
        readPngDimensions(path.join(projectRoot, 'public', 'icons', 'pwa-192.png')),
        { width: 192, height: 192 }
    );
    assert.deepEqual(
        readPngDimensions(path.join(projectRoot, 'public', 'icons', 'pwa-512.png')),
        { width: 512, height: 512 }
    );
});

test('production HTML links the manifest, theme metadata and versioned PWA controller', () => {
    const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');

    assert.match(html, /<meta name="theme-color" content="#d61220">/);
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest\?v=[a-f0-9]{16}">/);
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/pwa-192\.png">/);
    assert.match(html, /<script type="module" src="\/js\/pwaController\.js\?v=[a-f0-9]{16}"><\/script>/);
});

test('service worker treats API, auth, metrics and Socket.IO as network only', () => {
    for (const pathname of [
        '/api',
        '/api/auth/login',
        '/api/account/dashboard',
        '/api/health',
        '/socket.io',
        '/socket.io/',
        '/socket.io/?EIO=4&transport=polling',
        '/metrics'
    ]) {
        assert.equal(serviceWorker.isNetworkOnlyPath(pathname.split('?')[0]), true, pathname);
    }

    assert.equal(serviceWorker.isNetworkOnlyPath('/game.bundle.min.js'), false);
    assert.equal(serviceWorker.isStaticAssetPath('/game.bundle.min.js'), true);
    assert.equal(serviceWorker.isStaticAssetPath('/manifest.webmanifest'), true);
    assert.equal(serviceWorker.isStaticAssetPath('/room/ABC'), false);
});

test('service worker handles only same-origin GET navigations and static assets', async () => {
    const responded = [];
    const cachesObject = {
        async open() {
            return {
                async match() { return new Response('cached'); },
                async put() {}
            };
        }
    };
    const fetchFn = async () => new Response('network');
    const createEvent = request => ({
        request,
        respondWith(value) { responded.push(value); }
    });

    assert.equal(serviceWorker.handleFetchEvent(createEvent(new Request('https://app.test/api/auth/session')), {
        scopeOrigin: 'https://app.test', cachesObject, fetchFn
    }), false);
    assert.equal(serviceWorker.handleFetchEvent(createEvent(new Request('https://app.test/socket.io/socket.io.js')), {
        scopeOrigin: 'https://app.test', cachesObject, fetchFn
    }), false);
    assert.equal(serviceWorker.handleFetchEvent(createEvent(new Request('https://cdn.test/app.js')), {
        scopeOrigin: 'https://app.test', cachesObject, fetchFn
    }), false);
    assert.equal(serviceWorker.handleFetchEvent(createEvent(new Request('https://app.test/app.js', { method: 'POST' })), {
        scopeOrigin: 'https://app.test', cachesObject, fetchFn
    }), false);

    assert.equal(serviceWorker.handleFetchEvent(createEvent({ url: 'https://app.test/', method: 'GET', mode: 'navigate' }), {
        scopeOrigin: 'https://app.test', cachesObject, fetchFn
    }), true);
    assert.equal(serviceWorker.handleFetchEvent(createEvent(new Request('https://app.test/style.bundle.css?v=abc')), {
        scopeOrigin: 'https://app.test', cachesObject, fetchFn
    }), true);
    assert.equal(responded.length, 2);
    await Promise.all(responded);
});

test('service worker precache bypasses stale HTTP cache entries', async () => {
    const fetched = [];
    const stored = [];
    const cache = {
        async put(url, response) {
            stored.push({ url, response });
        }
    };
    const cachesObject = {
        async open(name) {
            assert.match(name, /^f1-guesser-static-/);
            return cache;
        }
    };

    await serviceWorker.installStaticCache({
        cachesObject,
        async fetchFn(url, options) {
            fetched.push({ url, options });
            return new Response(`asset:${url}`);
        }
    });

    assert.ok(fetched.length > 10);
    assert.equal(stored.length, fetched.length);
    assert.ok(fetched.every(entry => entry.options.cache === 'reload'));
    assert.ok(fetched.every(entry => entry.options.credentials === 'same-origin'));
    assert.equal(fetched.some(entry => entry.url.startsWith('/api')), false);
    assert.equal(fetched.some(entry => entry.url.startsWith('/socket.io')), false);
});

test('navigation uses network first with cached app shell fallback', async () => {
    const cachedResponse = new Response('offline shell');
    const cachesObject = {
        async open(name) {
            assert.match(name, /^f1-guesser-static-/);
            return {
                async match(key) {
                    assert.equal(key, '/index.html');
                    return cachedResponse;
                }
            };
        }
    };

    const response = await serviceWorker.networkFirstNavigation(
        new Request('https://app.test/room/ABC'),
        {
            cachesObject,
            fetchFn: async () => { throw new Error('offline'); }
        }
    );
    assert.equal(await response.text(), 'offline shell');
});

test('PWA controller registers only in supported secure contexts', async () => {
    const {
        canRegisterPwaServiceWorker,
        registerPwaServiceWorker
    } = await pwaModulePromise;
    const calls = [];
    const registration = { scope: '/' };
    const navigatorObject = {
        serviceWorker: {
            async register(url, options) {
                calls.push({ url, options });
                return registration;
            }
        }
    };
    const windowObject = createWindow();
    windowObject.navigator = navigatorObject;

    assert.equal(canRegisterPwaServiceWorker({ windowObject, navigatorObject }), true);
    assert.equal(await registerPwaServiceWorker({ windowObject, navigatorObject }), registration);
    assert.deepEqual(calls, [{
        url: '/service-worker.js',
        options: { scope: '/', updateViaCache: 'none' }
    }]);
    assert.equal(windowObject.events.at(-1).type, 'f1:pwa-ready');

    const insecure = createWindow({ secure: false, hostname: 'example.test' });
    assert.equal(canRegisterPwaServiceWorker({ windowObject: insecure, navigatorObject }), false);
    const localhost = createWindow({ secure: false, hostname: 'localhost' });
    assert.equal(canRegisterPwaServiceWorker({ windowObject: localhost, navigatorObject }), true);
    assert.equal(canRegisterPwaServiceWorker({ windowObject, navigatorObject: {} }), false);
});

test('PWA installer waits for load and reuses one registration promise', async () => {
    const { installPwaController } = await pwaModulePromise;
    const calls = [];
    const windowObject = createWindow({ readyState: 'loading' });
    windowObject.navigator = {
        serviceWorker: {
            async register(url) {
                calls.push(url);
                return { scope: '/' };
            }
        }
    };

    const first = installPwaController(windowObject);
    const second = installPwaController(windowObject);
    assert.equal(first, second);
    assert.deepEqual(calls, []);

    windowObject.dispatch('load');
    assert.deepEqual(await first, { scope: '/' });
    assert.deepEqual(calls, ['/service-worker.js']);
});

test('service worker cache helpers reject unsafe responses and refresh cache misses', async () => {
    assert.equal(serviceWorker.normalizePathname(), '/');
    assert.equal(serviceWorker.normalizePathname('assets/app.js'), '/assets/app.js');
    assert.equal(serviceWorker.canCacheResponse(null), false);
    assert.equal(serviceWorker.canCacheResponse(new Response('failed', { status: 500 })), false);
    assert.equal(serviceWorker.canCacheResponse({ ok: true, type: 'opaque', headers: new Headers() }), false);
    assert.equal(serviceWorker.canCacheResponse(new Response('private', {
        headers: { 'cache-control': 'private, no-store' }
    })), false);
    assert.equal(serviceWorker.canCacheResponse(new Response('static')), true);

    const stored = [];
    const request = new Request('https://app.test/app.js');
    const response = await serviceWorker.cacheFirstStatic(request, {
        cachesObject: {
            async open() {
                return {
                    async match() { return null; },
                    async put(key, value) { stored.push({ key, value }); }
                };
            }
        },
        fetchFn: async () => new Response('fresh')
    });
    assert.equal(await response.text(), 'fresh');
    assert.equal(stored.length, 1);

    const noStoreWrites = [];
    await serviceWorker.cacheFirstStatic(request, {
        cachesObject: {
            async open() {
                return {
                    async match() { return null; },
                    async put(...args) { noStoreWrites.push(args); }
                };
            }
        },
        fetchFn: async () => new Response('private', {
            headers: { 'cache-control': 'no-store' }
        })
    });
    assert.deepEqual(noStoreWrites, []);
});

test('service worker removes only obsolete app caches and surfaces missing offline shell', async () => {
    const deleted = [];
    await serviceWorker.removeOldStaticCaches({
        cachesObject: {
            async keys() {
                return [
                    'f1-guesser-static-old',
                    'f1-guesser-static-608ef1f05f56370c9ed3',
                    'another-app-cache'
                ];
            },
            async delete(name) {
                deleted.push(name);
                return true;
            }
        }
    });
    assert.deepEqual(deleted, ['f1-guesser-static-old']);

    await assert.rejects(
        serviceWorker.networkFirstNavigation(new Request('https://app.test/offline'), {
            cachesObject: {
                async open() {
                    return { async match() { return null; } };
                }
            },
            fetchFn: async () => { throw new Error('network unavailable'); }
        }),
        /network unavailable/
    );
});

test('service worker install fails closed when a precache response is invalid', async () => {
    await assert.rejects(
        serviceWorker.installStaticCache({
            cachesObject: {
                async open() {
                    return { async put() {} };
                }
            },
            fetchFn: async url => url.includes('/index.html')
                ? new Response('failed', { status: 503 })
                : new Response('ok')
        }),
        /Precache request failed: \/index\.html/
    );
});

test('PWA registration failure is non-fatal and dispatches an error event when available', async () => {
    const { registerPwaServiceWorker, installPwaController } = await pwaModulePromise;
    const windowObject = createWindow();
    const expectedError = new Error('registration blocked');
    const navigatorObject = {
        serviceWorker: {
            async register() { throw expectedError; }
        }
    };
    windowObject.navigator = navigatorObject;

    assert.equal(await registerPwaServiceWorker({ windowObject, navigatorObject }), null);
    assert.equal(windowObject.events.at(-1).type, 'f1:pwa-error');
    assert.equal(windowObject.events.at(-1).detail.error, expectedError);

    const silentWindow = {
        document: { readyState: 'complete' },
        isSecureContext: true,
        location: { hostname: 'example.test' },
        navigator: {
            serviceWorker: {
                async register() { return { scope: '/' }; }
            }
        }
    };
    assert.deepEqual(await installPwaController(silentWindow), { scope: '/' });
    assert.equal(installPwaController({}), null);
});
