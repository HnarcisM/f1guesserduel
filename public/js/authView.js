import { accountApi, authApi } from './apiClient.js';

export function createAuthView({ onAuthChanged } = {}) {
    let currentUser = null;
    let socketAuthToken = null;
    let mode = 'login';
    let authStateVersion = 0;

    function getEls() {
        return {
            openBtn: document.getElementById('authOpenBtn'),
            panel: document.getElementById('authPanel'),
            backdrop: document.getElementById('authBackdrop'),
            closeBtn: document.getElementById('authCloseBtn'),
            title: document.getElementById('authTitle'),
            subtitle: document.getElementById('authSubtitle'),
            usernameGroup: document.getElementById('authUsernameGroup'),
            username: document.getElementById('authUsername'),
            email: document.getElementById('authEmail'),
            password: document.getElementById('authPassword'),
            submitBtn: document.getElementById('authSubmitBtn'),
            message: document.getElementById('authMessage'),
            userBadge: document.getElementById('authUserBadge'),
            logoutBtn: document.getElementById('authLogoutBtn'),
            switchBtn: document.getElementById('authSwitchBtn'),
            form: document.getElementById('authForm'),
            accountView: document.getElementById('authAccountView'),
            accountAvatar: document.getElementById('authAccountAvatar'),
            accountUsername: document.getElementById('authAccountUsername'),
            accountEmail: document.getElementById('authAccountEmail'),
            accountMemberSince: document.getElementById('authAccountMemberSince'),
            statPlayed: document.getElementById('authStatPlayed'),
            statWon: document.getElementById('authStatWon'),
            statWinRate: document.getElementById('authStatWinRate'),
            statBestStreak: document.getElementById('authStatBestStreak'),
            singleStats: document.getElementById('authSingleStats'),
            dailyStats: document.getElementById('authDailyStats'),
            duelStats: document.getElementById('authDuelStats'),
            accountStatsMessage: document.getElementById('authAccountStatsMessage')
        };
    }

    function emitAuthChanged() {
        if (typeof onAuthChanged === 'function') {
            onAuthChanged(currentUser, socketAuthToken);
        }
    }

    function setMessage(message = '', type = 'info') {
        const { message: messageEl } = getEls();
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.dataset.type = type;
    }

    function setMode(nextMode) {
        if (currentUser) {
            renderUser();
            return;
        }
        mode = nextMode === 'register' ? 'register' : 'login';
        const els = getEls();

        if (els.title) els.title.textContent = mode === 'register' ? 'Creează cont' : 'Autentificare';
        if (els.subtitle) {
            els.subtitle.textContent = mode === 'register'
                ? 'Creează un cont pentru profil, statistici și dueluri cu prieteni.'
                : 'Intră în cont ca să pregătim profilul și jocurile cu prieteni.';
        }
        if (els.usernameGroup) els.usernameGroup.classList.toggle('is-hidden', mode !== 'register');
        if (els.submitBtn) els.submitBtn.textContent = mode === 'register' ? 'Creează cont' : 'Login';
        if (els.switchBtn) els.switchBtn.textContent = mode === 'register' ? 'Ai deja cont? Login' : 'Nu ai cont? Register';
        setMessage('');
    }

    function renderUser() {
        const els = getEls();
        const isAuthenticated = Boolean(currentUser);
        const label = currentUser ? `👤 ${currentUser.username}` : '👤 Login';

        if (els.openBtn) els.openBtn.textContent = label;
        if (els.userBadge) {
            els.userBadge.textContent = currentUser
                ? `Logat ca ${currentUser.username}`
                : 'Joci momentan ca Guest.';
        }
        if (els.form) els.form.classList.toggle('is-hidden', isAuthenticated);
        if (els.accountView) els.accountView.classList.toggle('is-hidden', !isAuthenticated);
        if (els.switchBtn) els.switchBtn.classList.toggle('is-hidden', isAuthenticated);
        if (els.logoutBtn) els.logoutBtn.classList.toggle('is-hidden', !isAuthenticated);

        if (isAuthenticated) {
            if (els.title) els.title.textContent = 'Contul meu';
            if (els.subtitle) els.subtitle.textContent = 'Profilul și statisticile tale F1 Guesser Duel.';
            if (els.accountAvatar) {
                els.accountAvatar.textContent = String(currentUser.username || 'FG').slice(0, 2).toUpperCase();
            }
            if (els.accountUsername) els.accountUsername.textContent = currentUser.username || 'Utilizator';
            if (els.accountEmail) els.accountEmail.textContent = currentUser.email || '';
            if (els.accountMemberSince) {
                els.accountMemberSince.textContent = formatMemberSince(currentUser.createdAt);
            }
        }
    }

    function formatMemberSince(createdAt) {
        const date = new Date(createdAt);
        if (!createdAt || Number.isNaN(date.getTime())) return 'Membru F1 Guesser';
        return `Membru din ${new Intl.DateTimeFormat('ro-RO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(date)}`;
    }

    function renderModeStats(element, stats, { includeDraws = false } = {}) {
        if (!element) return;
        const played = Number(stats?.played) || 0;
        const won = Number(stats?.won) || 0;
        const draws = Number(stats?.drawn) || 0;
        element.textContent = includeDraws
            ? `${played} jocuri · ${won} victorii · ${draws} remize`
            : `${played} jocuri · ${won} victorii`;
    }

    function renderAccountStats(stats = {}) {
        const els = getEls();
        const totals = stats.totals || {};
        if (els.statPlayed) els.statPlayed.textContent = String(Number(totals.played) || 0);
        if (els.statWon) els.statWon.textContent = String(Number(totals.won) || 0);
        if (els.statWinRate) els.statWinRate.textContent = `${Number(totals.winRate) || 0}%`;
        if (els.statBestStreak) els.statBestStreak.textContent = String(Number(totals.bestStreak) || 0);
        renderModeStats(els.singleStats, stats.modes?.single);
        renderModeStats(els.dailyStats, stats.modes?.daily);
        renderModeStats(els.duelStats, stats.modes?.duel, { includeDraws: true });
        if (els.accountStatsMessage) els.accountStatsMessage.textContent = '';
    }

    async function refreshAccountSummary(providedStats = null, expectedUserId = null) {
        if (!currentUser) return;
        if (expectedUserId !== null && String(currentUser.id) !== String(expectedUserId)) return;
        if (providedStats) {
            renderAccountStats(providedStats);
            return;
        }

        const requestedUserId = currentUser.id;
        const requestedStateVersion = authStateVersion;
        const els = getEls();
        if (els.accountStatsMessage) els.accountStatsMessage.textContent = 'Se încarcă statisticile…';
        try {
            const data = await accountApi.summary();
            if (requestedStateVersion !== authStateVersion
                || !currentUser
                || String(currentUser.id) !== String(requestedUserId)) return;
            if (data.user) currentUser = data.user;
            renderUser();
            renderAccountStats(data.stats);
        } catch (error) {
            if (requestedStateVersion !== authStateVersion
                || !currentUser
                || String(currentUser.id) !== String(requestedUserId)) return;
            if (els.accountStatsMessage) {
                els.accountStatsMessage.textContent = error.message || 'Statisticile nu au putut fi încărcate.';
            }
        }
    }

    function openPanel() {
        const { panel, backdrop } = getEls();
        if (panel) panel.classList.add('show');
        if (backdrop) backdrop.classList.add('show');
        renderUser();
        if (currentUser) refreshAccountSummary();
        else setMode(mode);
    }

    function closePanel() {
        const { panel, backdrop } = getEls();
        if (panel) panel.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
    }

    async function refreshCurrentUser() {
        const requestedStateVersion = authStateVersion;
        try {
            const data = await authApi.me();
            if (requestedStateVersion !== authStateVersion) return;
            const previousUserId = currentUser?.id;
            currentUser = data.user || null;
            socketAuthToken = data.socketAuthToken || null;
            if (String(previousUserId ?? '') !== String(currentUser?.id ?? '')) renderAccountStats();
            renderUser();
            emitAuthChanged();
        } catch (error) {
            if (requestedStateVersion !== authStateVersion) return;
            currentUser = null;
            socketAuthToken = null;
            renderAccountStats();
            renderUser();
            emitAuthChanged();
        }
    }

    async function submitAuthForm(event) {
        event.preventDefault();
        const requestedStateVersion = ++authStateVersion;
        const els = getEls();
        const email = els.email ? els.email.value.trim() : '';
        const password = els.password ? els.password.value : '';
        const username = els.username ? els.username.value.trim() : '';

        try {
            setMessage('Se procesează...', 'info');
            const data = mode === 'register'
                ? await authApi.register({ username, email, password })
                : await authApi.login({ email, password });
            if (requestedStateVersion !== authStateVersion) return;

            currentUser = data.user || null;
            socketAuthToken = data.socketAuthToken || null;
            renderAccountStats();
            renderUser();
            emitAuthChanged();
            setMessage(currentUser ? `Bun venit, ${currentUser.username}!` : 'Autentificare reușită.', 'success');

            if (els.password) els.password.value = '';
            setTimeout(closePanel, 500);
        } catch (error) {
            if (requestedStateVersion !== authStateVersion) return;
            setMessage(error.message || 'Nu am putut finaliza autentificarea.', 'error');
        }
    }

    async function logout() {
        const requestedStateVersion = ++authStateVersion;
        try {
            await authApi.logout();
        } catch (error) {
            console.warn('Logout request failed:', error);
        }

        if (requestedStateVersion !== authStateVersion) return;

        currentUser = null;
        socketAuthToken = null;
        renderAccountStats();
        renderUser();
        emitAuthChanged();
        setMessage('Ai ieșit din cont.', 'success');
        setMode('login');
    }

    function setup() {
        const els = getEls();
        if (els.openBtn) els.openBtn.addEventListener('click', openPanel);
        if (els.closeBtn) els.closeBtn.addEventListener('click', closePanel);
        if (els.backdrop) els.backdrop.addEventListener('click', closePanel);
        if (els.switchBtn) els.switchBtn.addEventListener('click', () => setMode(mode === 'register' ? 'login' : 'register'));
        if (els.logoutBtn) els.logoutBtn.addEventListener('click', logout);
        if (els.panel) {
            const form = els.panel.querySelector('form');
            if (form) form.addEventListener('submit', submitAuthForm);
        }

        setMode('login');
        refreshCurrentUser();
    }

    function getCurrentUser() {
        return currentUser;
    }

    function getSocketAuthToken() {
        return socketAuthToken;
    }

    return {
        setup,
        refreshCurrentUser,
        getCurrentUser,
        getSocketAuthToken,
        refreshAccountSummary,
        openPanel,
        closePanel
    };
}
