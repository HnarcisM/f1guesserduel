const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function createDeferred() {
    let resolve;
    const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
    return { promise, resolve };
}

function createElement() {
    const classes = new Set();
    const listeners = new Map();
    return {
        value: '',
        textContent: '',
        dataset: {},
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            toggle(name, force) {
                if (force === undefined ? !classes.has(name) : force) classes.add(name);
                else classes.delete(name);
            },
            contains: name => classes.has(name)
        },
        addEventListener(eventName, handler) {
            listeners.set(eventName, handler);
        },
        listeners
    };
}

function createAccountDocument() {
    const ids = [
        'authOpenBtn', 'authPanel', 'authBackdrop', 'authCloseBtn', 'authTitle', 'authSubtitle',
        'authUsernameGroup', 'authUsername', 'authEmail', 'authPassword', 'authSubmitBtn',
        'authSwitchBtn', 'authMessage', 'authUserBadge', 'authLogoutBtn', 'authForm',
        'authAccountView', 'authAccountAvatar', 'authAccountUsername', 'authAccountEmail',
        'authAccountMemberSince', 'authStatPlayed', 'authStatWon', 'authStatWinRate',
        'authStatBestStreak', 'authSingleStats', 'authDailyStats', 'authDuelStats',
        'authAccountStatsMessage'
    ];
    const elements = Object.fromEntries(ids.map(id => [id, createElement()]));
    elements.authPanel.querySelector = selector => selector === 'form' ? elements.authForm : null;
    elements.authEmail.value = 'narcis@example.com';
    elements.authPassword.value = 'StrongPassword123!';
    return {
        elements,
        document: { getElementById: id => elements[id] || null }
    };
}

test('authenticated account dashboard is present while the login form remains separate', () => {
    const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(projectRoot, 'public', 'css', '08-auth.css'), 'utf8');

    assert.match(html, /id="authAccountView"[^>]*is-hidden/);
    assert.match(html, /id="authForm"/);
    assert.match(html, /id="authStatPlayed"/);
    assert.match(html, /id="authSingleStats"/);
    assert.match(html, /id="authDailyStats"/);
    assert.match(html, /id="authDuelStats"/);
    assert.match(css, /\.auth-stats-grid/);
});

test('server account stats updates are forwarded to the account dashboard', async () => {
    const { registerSocketEvents } = await import('../public/js/socketEvents.js');
    const handlers = new Map();
    const received = [];
    const socket = {
        off() {},
        on(eventName, handler) {
            handlers.set(eventName, handler);
        }
    };

    registerSocketEvents(socket, {
        refreshAccountSummary(stats) {
            received.push(stats);
        }
    });
    const stats = { totals: { played: 4 }, modes: {} };
    handlers.get('accountStatsUpdated')({ stats });

    assert.deepEqual(received, [stats]);
});

test('a delayed initial auth refresh cannot overwrite a newer login or another account stats event', async t => {
    const originalDocument = globalThis.document;
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const { document, elements } = createAccountDocument();
    const initialMe = createDeferred();
    const login = createDeferred();
    globalThis.document = document;
    globalThis.fetch = url => url.endsWith('/me') ? initialMe.promise : login.promise;
    globalThis.setTimeout = () => 0;
    t.after(() => {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
        if (originalFetch === undefined) delete globalThis.fetch;
        else globalThis.fetch = originalFetch;
        globalThis.setTimeout = originalSetTimeout;
    });

    const { createAuthView } = await import('../public/js/authView.js');
    const view = createAuthView();
    view.setup();

    const submitPromise = elements.authForm.listeners.get('submit')({ preventDefault() {} });
    login.resolve({
        ok: true,
        async json() {
            return {
                user: { id: 7, username: 'Narcis', email: 'narcis@example.com' },
                socketAuthToken: 'socket-token'
            };
        }
    });
    await submitPromise;

    initialMe.resolve({ ok: true, async json() { return { user: null, socketAuthToken: null }; } });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(view.getCurrentUser().id, 7);
    await view.refreshAccountSummary({ totals: { played: 99 }, modes: {} }, 8);
    assert.equal(elements.authStatPlayed.textContent, '0');
    await view.refreshAccountSummary({ totals: { played: 5 }, modes: {} }, 7);
    assert.equal(elements.authStatPlayed.textContent, '5');
});
