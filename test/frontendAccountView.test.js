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
        focus() {
            globalThis.document.activeElement = this;
        },
        querySelectorAll() {
            return [];
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
        'authAccountMemberSince', 'authAccountLevel', 'authTotalXp', 'authXpProgress',
        'authXpProgressBar', 'authLevelProgressText', 'authXpToNextLevel',
        'authAvatarPresetGrid', 'authAvatarHelmetRed', 'authAvatarHelmetBlue',
        'authAvatarHelmetYellow', 'authAvatarHelmetGreen', 'authAvatarHelmetOrange',
        'authAvatarHelmetPurple', 'authAvatarHelmetCyan', 'authAvatarHelmetWhite',
        'authSaveAvatarBtn',
        'authTabOverview', 'authTabStats', 'authTabHistory',
        'authTabAchievements', 'authTabSettings', 'authPanelOverview',
        'authPanelAchievements', 'authPanelStats', 'authPanelHistory',
        'authPanelSettings',
        'authStatPlayed', 'authStatWon', 'authStatWinRate',
        'authStatBestStreak', 'authSingleStats', 'authDailyStats', 'authDuelStats',
        'authStatsModeSingle', 'authStatsModeDaily', 'authStatsModeDuel',
        'authModeOutcomeDetail', 'authModeStreakDetail', 'authGameHistory',
        'authAchievementSummary', 'authAchievementGrid',
        'authGuessCount1', 'authGuessCount2', 'authGuessCount3', 'authGuessCount4',
        'authGuessCount5', 'authGuessCount6', 'authGuessBar1', 'authGuessBar2',
        'authGuessBar3', 'authGuessBar4', 'authGuessBar5', 'authGuessBar6',
        'authAccountStatsMessage', 'authUsernameSettingsForm', 'authSettingsUsername',
        'authUsernameCooldownHint', 'authUsernameCurrentPassword', 'authSaveUsernameBtn',
        'authPasswordSettingsForm',
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
    assert.match(html, /id="authAccountLevel"/);
    assert.match(html, /id="authXpProgress"[^>]*role="progressbar"/);
    assert.match(html, /id="authXpProgressBar"/);
    assert.match(html, /id="authAvatarPresetGrid"/);
    assert.equal((html.match(/class="auth-avatar-option"/g) || []).length, 8);
    assert.match(html, /id="authSingleStats"/);
    assert.match(html, /id="authDailyStats"/);
    assert.match(html, /id="authDuelStats"/);
    assert.match(html, /id="authStatsDetailsTitle"/);
    assert.match(html, /id="authGuessBar6"/);
    assert.match(html, /id="authGameHistory"/);
    assert.match(html, /id="authTabOverview"[^>]*role="tab"/);
    assert.match(html, /id="authTabAchievements"[^>]*role="tab"/);
    assert.match(html, /id="authTabStats"[^>]*role="tab"/);
    assert.match(html, /id="authTabHistory"[^>]*role="tab"/);
    assert.match(html, /id="authTabSettings"[^>]*role="tab"/);
    assert.match(html, /id="authPanelStats"[^>]*role="tabpanel"[^>]*hidden/);
    assert.match(html, /id="authPanelAchievements"[^>]*role="tabpanel"[^>]*hidden/);
    assert.match(html, /id="authAchievementGrid"/);
    assert.match(html, /id="authPanelHistory"[^>]*role="tabpanel"[^>]*hidden/);
    assert.match(html, /id="authPanelSettings"[^>]*role="tabpanel"[^>]*hidden/);
    assert.match(html, /id="authUsernameSettingsForm"/);
    assert.match(html, /id="authUsernameCooldownHint"/);
    assert.match(html, /o dată la 7 zile/);
    assert.match(html, /id="authPasswordSettingsForm"/);
    assert.match(html, /id="authLogoutAllBtn"/);
    assert.match(html, /id="authPanel"[^>]*aria-describedby="authSubtitle"[^>]*aria-hidden="true"[^>]*tabindex="-1"/);
    assert.equal((html.match(/<details class="auth-settings-card auth-settings-disclosure/g) || []).length, 3);
    assert.doesNotMatch(html, /<details class="auth-settings-card auth-settings-disclosure"[^>]*\sopen(?:\s|>)/);
    assert.match(css, /\.auth-stats-grid/);
    assert.match(css, /\.auth-progress-card/);
    assert.match(css, /\.auth-xp-progress/);
    assert.match(css, /\.auth-avatar-grid/);
    assert.match(css, /\.auth-helmet-icon/);
    assert.match(css, /\.auth-profile-tabs/);
    assert.match(css, /\.auth-achievement-card/);
    assert.match(css, /\.auth-settings-disclosure\[open\]/);
});

test('login remains interactive above the initial mode overlay', () => {
    const headerCss = fs.readFileSync(path.join(projectRoot, 'public', 'css', '02-header-menu.css'), 'utf8');
    const overlayCss = fs.readFileSync(path.join(projectRoot, 'public', 'css', '04-difficulty-overlay.css'), 'utf8');
    const authCss = fs.readFileSync(path.join(projectRoot, 'public', 'css', '08-auth.css'), 'utf8');

    assert.match(headerCss, /\.site-header\s*\{[\s\S]*?z-index:\s*2000\b/);
    assert.match(overlayCss, /\.overlay\s*\{[\s\S]*?z-index:\s*1500\b/);
    assert.match(authCss, /\.auth-backdrop\s*\{[\s\S]*?z-index:\s*10990\b/);
    assert.match(authCss, /\.auth-panel\s*\{[\s\S]*?z-index:\s*11000\b/);
});

test('auth dialog moves focus inside, closes with Escape and restores the opener', async t => {
    const originalDocument = globalThis.document;
    const originalFetch = globalThis.fetch;
    const { document, elements } = createAccountDocument();
    globalThis.document = document;
    globalThis.fetch = async () => ({ ok: true, async json() { return { user: null }; } });
    t.after(() => {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
        if (originalFetch === undefined) delete globalThis.fetch;
        else globalThis.fetch = originalFetch;
    });

    const { createAuthView } = await import('../public/js/authView.js');
    const view = createAuthView();
    view.setup();
    elements.authOpenBtn.focus();
    elements.authOpenBtn.listeners.get('click')();

    assert.equal(elements.authPanel.classList.contains('show'), true);
    assert.equal(elements.authPanel.getAttribute('aria-hidden'), 'false');
    assert.equal(elements.authOpenBtn.getAttribute('aria-expanded'), 'true');
    assert.equal(document.activeElement, elements.authEmail);

    elements.authPanel.listeners.get('keydown')({
        key: 'Escape',
        preventDefault() {},
        stopPropagation() {}
    });
    assert.equal(elements.authPanel.classList.contains('show'), false);
    assert.equal(elements.authPanel.getAttribute('aria-hidden'), 'true');
    assert.equal(elements.authOpenBtn.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, elements.authOpenBtn);
});

test('server account stats updates are forwarded to the account dashboard', async () => {
    const { registerSocketEvents } = await import('../public/js/socketEvents.js');
    const handlers = new Map();
    const received = [];
    const rewards = [];
    const socket = {
        off() {},
        on(eventName, handler) {
            handlers.set(eventName, handler);
        }
    };

    registerSocketEvents(socket, {
        refreshAccountSummary(stats) {
            received.push(stats);
        },
        showAccountReward(reward) {
            rewards.push(reward);
        }
    });
    const stats = { totals: { played: 4 }, modes: {} };
    const reward = { mode: 'single', outcome: 'win', xpAwarded: 50 };
    handlers.get('accountStatsUpdated')({ stats, reward });

    assert.deepEqual(received, [{
        stats,
        recentGames: [],
        progress: null,
        achievements: [],
        xpAwarded: 0
    }]);
    assert.deepEqual(rewards, [reward]);
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
        }],
        progress: {
            level: 2,
            totalXp: 250,
            xpIntoLevel: 150,
            xpForLevel: 300,
            xpToNextLevel: 150,
            progressPercent: 50
        },
        achievements: [{
            key: 'first-win',
            title: 'Prima victorie',
            description: 'Câștigă primul joc.',
            icon: '🏆',
            current: 1,
            target: 1,
            unlocked: true,
            progressPercent: 100
        }, {
            key: 'duel-contender',
            title: 'Duelist',
            description: 'Joacă 5 dueluri online.',
            icon: 'VS',
            current: 1,
            target: 5,
            unlocked: false,
            progressPercent: 20
        }]
    }, 7);
    assert.equal(elements.authStatPlayed.textContent, '5');
    assert.equal(elements.authAccountLevel.textContent, 'Nivel 2');
    assert.equal(elements.authTotalXp.textContent, '250 XP total');
    assert.equal(elements.authXpProgressBar.dataset.progressPercent, '50');
    assert.equal(elements.authXpProgressBar.classList.contains('progress-percent-50'), true);
    assert.equal(elements.authXpProgress.getAttribute('aria-valuenow'), '50');
    assert.equal(elements.authLevelProgressText.textContent, '150 / 300 XP');
    assert.equal(elements.authXpToNextLevel.textContent, '150 XP până la nivelul 3');
    assert.equal(elements.authAchievementSummary.textContent, '1 / 2 deblocate');
    assert.equal(elements.authAchievementGrid.children.length, 2);
    assert.match(elements.authAchievementGrid.children[0].className, /is-unlocked/);
    assert.equal(elements.authGameHistory.children.length, 1);
    assert.match(elements.authGameHistory.children[0].children[0].textContent, /Victorie · Duel/);

    elements.authTabHistory.listeners.get('click')();
    assert.equal(elements.authTabHistory.getAttribute('aria-selected'), 'true');
    assert.equal(elements.authPanelHistory.hidden, false);
    assert.equal(elements.authPanelOverview.hidden, true);

    elements.authTabAchievements.listeners.get('click')();
    assert.equal(elements.authTabAchievements.getAttribute('aria-selected'), 'true');
    assert.equal(elements.authPanelAchievements.hidden, false);

    elements.authTabAchievements.listeners.get('keydown')({ key: 'ArrowRight', preventDefault() {} });
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
                        user: {
                            id: 7,
                            username: 'Narcis',
                            email: 'narcis@example.com',
                            avatarKey: 'helmet-red'
                        },
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
                        user: {
                            id: 7,
                            username: 'Narcis_New',
                            email: 'narcis@example.com',
                            avatarKey: 'helmet-blue',
                            usernameChangedAt: '2026-07-18T12:00:00.000Z',
                            usernameChangeAvailableAt: '2099-07-25T12:00:00.000Z'
                        },
                        socketAuthToken: 'socket-profile'
                    };
                }
            };
        }
        if (url.endsWith('/avatar')) {
            return {
                ok: true,
                async json() {
                    return {
                        user: {
                            id: 7,
                            username: 'Narcis',
                            email: 'narcis@example.com',
                            avatarKey: 'helmet-blue'
                        },
                        socketAuthToken: 'socket-avatar'
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
                        user: {
                            id: 7,
                            username: 'Narcis_New',
                            email: 'narcis@example.com',
                            avatarKey: 'helmet-blue'
                        },
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
    assert.equal(elements.authAccountAvatar.dataset.avatarKey, 'helmet-red');

    elements.authAvatarHelmetBlue.listeners.get('click')();
    assert.equal(elements.authAccountAvatar.dataset.avatarKey, 'helmet-blue');
    assert.equal(elements.authAvatarHelmetBlue.getAttribute('aria-pressed'), 'true');
    await elements.authSaveAvatarBtn.listeners.get('click')();
    assert.equal(view.getCurrentUser().avatarKey, 'helmet-blue');
    assert.equal(view.getSocketAuthToken(), 'socket-avatar');
    assert.deepEqual(JSON.parse(
        requests.find(request => request.url.endsWith('/avatar')).options.body
    ), { avatarKey: 'helmet-blue' });

    elements.authSettingsUsername.value = 'Narcis_New';
    elements.authSettingsUsername.listeners.get('input')();
    elements.authUsernameCurrentPassword.value = 'StrongPassword123!';
    await elements.authUsernameSettingsForm.listeners.get('submit')({ preventDefault() {} });
    assert.equal(view.getCurrentUser().username, 'Narcis_New');
    assert.equal(elements.authAccountUsername.textContent, 'Narcis_New');
    assert.equal(elements.authSettingsUsername.disabled, true);
    assert.equal(elements.authUsernameCurrentPassword.disabled, true);
    assert.equal(elements.authSaveUsernameBtn.disabled, true);
    assert.match(elements.authUsernameCooldownHint.textContent, /Următoarea schimbare/);
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
