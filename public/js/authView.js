import { accountApi, authApi } from './apiClient.js';

export function createAuthView({ onAuthChanged } = {}) {
    let currentUser = null;
    let socketAuthToken = null;
    let mode = 'login';
    let authStateVersion = 0;
    let selectedStatsMode = 'single';
    let currentAccountStats = {};

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
            statsModeSingle: document.getElementById('authStatsModeSingle'),
            statsModeDaily: document.getElementById('authStatsModeDaily'),
            statsModeDuel: document.getElementById('authStatsModeDuel'),
            modeOutcomeDetail: document.getElementById('authModeOutcomeDetail'),
            modeStreakDetail: document.getElementById('authModeStreakDetail'),
            gameHistory: document.getElementById('authGameHistory'),
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
        currentAccountStats = stats;
        const els = getEls();
        const totals = stats.totals || {};
        if (els.statPlayed) els.statPlayed.textContent = String(Number(totals.played) || 0);
        if (els.statWon) els.statWon.textContent = String(Number(totals.won) || 0);
        if (els.statWinRate) els.statWinRate.textContent = `${Number(totals.winRate) || 0}%`;
        if (els.statBestStreak) els.statBestStreak.textContent = String(Number(totals.bestStreak) || 0);
        renderModeStats(els.singleStats, stats.modes?.single);
        renderModeStats(els.dailyStats, stats.modes?.daily);
        renderModeStats(els.duelStats, stats.modes?.duel, { includeDraws: true });
        renderDetailedModeStats();
        if (els.accountStatsMessage) els.accountStatsMessage.textContent = '';
    }

    function renderDetailedModeStats() {
        const els = getEls();
        const stats = currentAccountStats.modes?.[selectedStatsMode] || {};
        const buttonMap = {
            single: els.statsModeSingle,
            daily: els.statsModeDaily,
            duel: els.statsModeDuel
        };

        for (const [modeName, button] of Object.entries(buttonMap)) {
            if (!button) continue;
            const isSelected = modeName === selectedStatsMode;
            button.classList.toggle('is-active', isSelected);
            button.setAttribute('aria-pressed', String(isSelected));
        }

        const won = Number(stats.won) || 0;
        const lost = Number(stats.lost) || 0;
        const drawn = Number(stats.drawn) || 0;
        if (els.modeOutcomeDetail) {
            els.modeOutcomeDetail.textContent = selectedStatsMode === 'duel'
                ? `${won} victorii · ${lost} înfrângeri · ${drawn} remize`
                : `${won} victorii · ${lost} înfrângeri`;
        }
        if (els.modeStreakDetail) {
            els.modeStreakDetail.textContent = `Streak: ${Number(stats.currentStreak) || 0} · Record: ${Number(stats.bestStreak) || 0}`;
        }

        const distribution = stats.distribution || {};
        const maximum = Math.max(1, ...Object.values(distribution).map(value => Number(value) || 0));
        for (let attempt = 1; attempt <= 6; attempt += 1) {
            const count = Number(distribution[attempt]) || 0;
            const countElement = document.getElementById(`authGuessCount${attempt}`);
            const barElement = document.getElementById(`authGuessBar${attempt}`);
            if (countElement) countElement.textContent = String(count);
            if (barElement) barElement.style.width = `${count > 0 ? Math.max(8, Math.round((count / maximum) * 100)) : 0}%`;
        }
    }

    function selectStatsMode(nextMode) {
        if (!['single', 'daily', 'duel'].includes(nextMode)) return;
        selectedStatsMode = nextMode;
        renderDetailedModeStats();
    }

    function formatHistoryDate(completedAt) {
        const date = new Date(completedAt);
        if (!completedAt || Number.isNaN(date.getTime())) return 'Dată necunoscută';
        return new Intl.DateTimeFormat('ro-RO', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function renderRecentGames(games = []) {
        const { gameHistory } = getEls();
        if (!gameHistory) return;
        gameHistory.replaceChildren();

        const recentGames = Array.isArray(games) ? games.slice(0, 10) : [];
        if (recentGames.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'auth-history-empty';
            empty.textContent = 'Joacă prima rundă pentru a începe istoricul.';
            gameHistory.appendChild(empty);
            return;
        }

        const modeLabels = { single: 'Single', daily: 'Daily', duel: 'Duel' };
        const outcomeLabels = { win: '🏆 Victorie', loss: '◼ Înfrângere', draw: '🤝 Remiză' };
        const difficultyLabels = { easy: 'Ușor', medium: 'Mediu', hard: 'Greu' };

        for (const game of recentGames) {
            const item = document.createElement('article');
            const title = document.createElement('strong');
            const details = document.createElement('span');
            const time = document.createElement('time');
            const attempts = Number(game.attempts) || 0;
            item.className = 'auth-history-item';
            title.textContent = `${outcomeLabels[game.outcome] || 'Rezultat'} · ${modeLabels[game.mode] || 'Joc'}`;
            details.textContent = `${difficultyLabels[game.difficulty] || 'Standard'} · ${attempts} ${attempts === 1 ? 'încercare' : 'încercări'}`;
            time.textContent = formatHistoryDate(game.completedAt);
            if (game.completedAt) time.dateTime = String(game.completedAt);
            item.append(title, details, time);
            gameHistory.appendChild(item);
        }
    }

    function renderAccountDashboard(summary = {}) {
        const stats = summary.stats || (summary.totals ? summary : {});
        renderAccountStats(stats);
        renderRecentGames(summary.recentGames || []);
    }

    async function refreshAccountSummary(providedSummary = null, expectedUserId = null) {
        if (!currentUser) return;
        if (expectedUserId !== null && String(currentUser.id) !== String(expectedUserId)) return;
        if (providedSummary) {
            renderAccountDashboard(providedSummary);
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
            renderAccountDashboard(data);
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
            if (String(previousUserId ?? '') !== String(currentUser?.id ?? '')) renderAccountDashboard();
            renderUser();
            emitAuthChanged();
        } catch (error) {
            if (requestedStateVersion !== authStateVersion) return;
            currentUser = null;
            socketAuthToken = null;
            renderAccountDashboard();
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
            renderAccountDashboard();
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
        renderAccountDashboard();
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
        if (els.statsModeSingle) els.statsModeSingle.addEventListener('click', () => selectStatsMode('single'));
        if (els.statsModeDaily) els.statsModeDaily.addEventListener('click', () => selectStatsMode('daily'));
        if (els.statsModeDuel) els.statsModeDuel.addEventListener('click', () => selectStatsMode('duel'));
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
