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
    const attributes = new Map();
    const children = [];
    return {
        value: '',
        textContent: '',
        className: '',
        dateTime: '',
        dataset: {},
        style: {},
        children,
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
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.get(name) || null;
        },
        replaceChildren(...nextChildren) {
            children.splice(0, children.length, ...nextChildren);
        },
        appendChild(child) {
            children.push(child);
            return child;
        },
        append(...nextChildren) {
            children.push(...nextChildren);
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
        'authAccountMemberSince', 'authTabOverview', 'authTabStats', 'authTabHistory',
        'authTabSettings', 'authPanelOverview', 'authPanelStats', 'authPanelHistory',
        'authPanelSettings',
        'authStatPlayed', 'authStatWon', 'authStatWinRate',
        'authStatBestStreak', 'authSingleStats', 'authDailyStats', 'authDuelStats',
        'authStatsModeSingle', 'authStatsModeDaily', 'authStatsModeDuel',
        'authModeOutcomeDetail', 'authModeStreakDetail', 'authGameHistory',
        'authGuessCount1', 'authGuessCount2', 'authGuessCount3', 'authGuessCount4',
        'authGuessCount5', 'authGuessCount6', 'authGuessBar1', 'authGuessBar2',
        'authGuessBar3', 'authGuessBar4', 'authGuessBar5', 'authGuessBar6',
        'authAccountStatsMessage', 'authUsernameSettingsForm', 'authSettingsUsername',
        'authUsernameCurrentPassword', 'authSaveUsernameBtn', 'authPasswordSettingsForm',
        'authPasswordCurrent', 'authPasswordNew', 'authPasswordConfirm', 'authSavePasswordBtn',
        'authLogoutAllBtn', 'authSettingsMessage'
    ];
    const elements = Object.fromEntries(ids.map(id => [id, createElement()]));
    elements.authPanel.querySelector = selector => selector === 'form' ? elements.authForm : null;
    elements.authEmail.value = 'narcis@example.com';
    elements.authPassword.value = 'StrongPassword123!';
    return {
        elements,
        document: {
            getElementById: id => elements[id] || null,
            createElement: () => createElement()
        }
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
    assert.match(html, /id="authStatsDetailsTitle"/);
    assert.match(html, /id="authGuessBar6"/);
    assert.match(html, /id="authGameHistory"/);
    assert.match(html, /id="authTabOverview"[^>]*role="tab"/);
    assert.match(html, /id="authTabStats"[^>]*role="tab"/);
    assert.match(html, /id="authTabHistory"[^>]*role="tab"/);
    assert.match(html, /id="authTabSettings"[^>]*role="tab"/);
    assert.match(html, /id="authPanelStats"[^>]*role="tabpanel"[^>]*hidden/);
    assert.match(html, /id="authPanelHistory"[^>]*role="tabpanel"[^>]*hidden/);
    assert.match(html, /id="authPanelSettings"[^>]*role="tabpanel"[^>]*hidden/);
    assert.match(html, /id="authUsernameSettingsForm"/);
    assert.match(html, /id="authPasswordSettingsForm"/);
    assert.match(html, /id="authLogoutAllBtn"/);
    assert.equal((html.match(/<details class="auth-settings-card auth-settings-disclosure">/g) || []).length, 2);
    assert.doesNotMatch(html, /<details class="auth-settings-card auth-settings-disclosure"[^>]*\sopen(?:\s|>)/);
    assert.match(css, /\.auth-stats-grid/);
    assert.match(css, /\.auth-profile-tabs/);
    assert.match(css, /\.auth-settings-disclosure\[open\]/);
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

    assert.deepEqual(received, [{ stats, recentGames: [] }]);
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
    await view.refreshAccountSummary({ stats: { totals: { played: 99 }, modes: {} } }, 8);
    assert.equal(elements.authStatPlayed.textContent, '0');
    await view.refreshAccountSummary({
        stats: {
            totals: { played: 5, won: 3, winRate: 60, bestStreak: 2 },
            modes: {
                single: { won: 1, lost: 1, drawn: 0, currentStreak: 0, bestStreak: 1, distribution: { 2: 1 } },
                daily: { won: 1, lost: 0, drawn: 0, currentStreak: 1, bestStreak: 1, distribution: { 1: 1 } },
                duel: { won: 1, lost: 1, drawn: 1, currentStreak: 0, bestStreak: 2, distribution: { 3: 1 } }
            }
        },
        recentGames: [{
            mode: 'duel',
            outcome: 'win',
            attempts: 3,
            difficulty: 'hard',
            completedAt: '2026-07-18T12:00:00.000Z'
        }]
    }, 7);
    assert.equal(elements.authStatPlayed.textContent, '5');
    assert.equal(elements.authGameHistory.children.length, 1);
    assert.match(elements.authGameHistory.children[0].children[0].textContent, /Victorie · Duel/);

    elements.authTabHistory.listeners.get('click')();
    assert.equal(elements.authTabHistory.getAttribute('aria-selected'), 'true');
    assert.equal(elements.authPanelHistory.hidden, false);
    assert.equal(elements.authPanelOverview.hidden, true);

    elements.authTabHistory.listeners.get('keydown')({ key: 'ArrowLeft', preventDefault() {} });
    assert.equal(elements.authTabStats.getAttribute('aria-selected'), 'true');
    assert.equal(elements.authPanelStats.hidden, false);

    elements.authStatsModeDuel.listeners.get('click')();
    assert.match(elements.authModeOutcomeDetail.textContent, /1 remize/);
    assert.equal(elements.authGuessCount3.textContent, '1');
});

test('account settings update credentials and logout every active session', async t => {
    const originalDocument = globalThis.document;
    const originalFetch = globalThis.fetch;
    const originalConfirm = globalThis.confirm;
    const { document, elements } = createAccountDocument();
    const requests = [];
    const authChanges = [];
    globalThis.document = document;
    globalThis.confirm = () => true;
    globalThis.fetch = async (url, options = {}) => {
        requests.push({ url, options });
        if (url.endsWith('/me')) {
            return {
                ok: true,
                async json() {
                    return {
                        user: { id: 7, username: 'Narcis', email: 'narcis@example.com' },
                        socketAuthToken: 'socket-initial'
                    };
                }
            };
        }
        if (url.endsWith('/profile')) {
            return {
                ok: true,
                async json() {
                    return {
                        user: { id: 7, username: 'Narcis_New', email: 'narcis@example.com' },
                        socketAuthToken: 'socket-profile'
                    };
                }
            };
        }
        if (url.endsWith('/password')) {
            return {
                ok: true,
                async json() {
                    return {
                        ok: true,
                        user: { id: 7, username: 'Narcis_New', email: 'narcis@example.com' },
                        socketAuthToken: 'socket-password',
                        sessionsRevoked: 2
                    };
                }
            };
        }
        if (url.endsWith('/logout-all')) {
            return { ok: true, async json() { return { ok: true, user: null, socketAuthToken: null }; } };
        }
        throw new Error(`Unexpected URL: ${url}`);
    };
    t.after(() => {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
        if (originalFetch === undefined) delete globalThis.fetch;
        else globalThis.fetch = originalFetch;
        if (originalConfirm === undefined) delete globalThis.confirm;
        else globalThis.confirm = originalConfirm;
    });

    const { createAuthView } = await import('../public/js/authView.js');
    const view = createAuthView({
        onAuthChanged(user, token) {
            authChanges.push({ user, token });
        }
    });
    view.setup();
    await new Promise(resolve => setImmediate(resolve));

    elements.authTabSettings.listeners.get('click')();
    assert.equal(elements.authPanelSettings.hidden, false);
    assert.equal(elements.authSettingsUsername.value, 'Narcis');

    elements.authSettingsUsername.value = 'Narcis_New';
    elements.authSettingsUsername.listeners.get('input')();
    elements.authUsernameCurrentPassword.value = 'StrongPassword123!';
    await elements.authUsernameSettingsForm.listeners.get('submit')({ preventDefault() {} });
    assert.equal(view.getCurrentUser().username, 'Narcis_New');
    assert.equal(elements.authAccountUsername.textContent, 'Narcis_New');
    assert.match(elements.authSettingsMessage.textContent, /actualizat/);

    elements.authPasswordCurrent.value = 'StrongPassword123!';
    elements.authPasswordNew.value = 'AnotherStrongPassword456!';
    elements.authPasswordConfirm.value = 'different';
    const passwordRequestsBeforeMismatch = requests.filter(request => request.url.endsWith('/password')).length;
    await elements.authPasswordSettingsForm.listeners.get('submit')({ preventDefault() {} });
    assert.equal(requests.filter(request => request.url.endsWith('/password')).length, passwordRequestsBeforeMismatch);
    assert.match(elements.authSettingsMessage.textContent, /nu coincide/);

    elements.authPasswordConfirm.value = 'AnotherStrongPassword456!';
    await elements.authPasswordSettingsForm.listeners.get('submit')({ preventDefault() {} });
    assert.equal(view.getSocketAuthToken(), 'socket-password');
    assert.match(elements.authSettingsMessage.textContent, /2 alte sesiuni/);

    await elements.authLogoutAllBtn.listeners.get('click')();
    assert.equal(view.getCurrentUser(), null);
    assert.equal(view.getSocketAuthToken(), null);
    assert.equal(authChanges.at(-1).user, null);
    assert.equal(requests.filter(request => request.url.endsWith('/logout-all')).length, 1);
});
