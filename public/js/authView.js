import { authApi } from './apiClient.js';
import { createAccountDashboardView } from './accountDashboardView.js';
import { createAccountSettingsController } from './accountSettingsController.js';
import { createDialogFocusManager } from './dialogFocusManager.js';
import { DEFAULT_AVATAR_KEY, getAuthViewElements } from './authViewElements.js';

const ACCOUNT_TABS = Object.freeze(['overview', 'achievements', 'stats', 'history', 'settings']);

export function createAuthView({ onAuthChanged } = {}) {
    const state = {
        currentUser: null,
        socketAuthToken: null,
        mode: 'login',
        authStateVersion: 0,
        selectedAccountTab: 'overview',
        selectedAvatarKey: DEFAULT_AVATAR_KEY
    };
    let dialogFocusManager = null;

    const dashboardView = createAccountDashboardView({
        state,
        getEls: getAuthViewElements,
        onUserUpdated: renderUser
    });
    const settingsController = createAccountSettingsController({
        state,
        getEls: getAuthViewElements,
        renderUser,
        emitAuthChanged,
        clearAuthenticatedState,
        setMessage
    });

    function selectAccountTab(nextTab, { focus = false } = {}) {
        if (!ACCOUNT_TABS.includes(nextTab)) return;
        state.selectedAccountTab = nextTab;
        const els = getAuthViewElements();
        const tabs = {
            overview: els.tabOverview,
            achievements: els.tabAchievements,
            stats: els.tabStats,
            history: els.tabHistory,
            settings: els.tabSettings
        };
        const panels = {
            overview: els.panelOverview,
            achievements: els.panelAchievements,
            stats: els.panelStats,
            history: els.panelHistory,
            settings: els.panelSettings
        };

        for (const [tabName, tab] of Object.entries(tabs)) {
            const isSelected = tabName === state.selectedAccountTab;
            if (tab) {
                tab.setAttribute('aria-selected', String(isSelected));
                tab.setAttribute('tabindex', isSelected ? '0' : '-1');
                tab.classList.toggle('is-active', isSelected);
            }
            if (panels[tabName]) {
                panels[tabName].hidden = !isSelected;
                panels[tabName].setAttribute('aria-hidden', String(!isSelected));
            }
        }

        if (focus && tabs[state.selectedAccountTab]?.focus) tabs[state.selectedAccountTab].focus();
    }

    function handleAccountTabKeydown(event) {
        const currentIndex = ACCOUNT_TABS.indexOf(state.selectedAccountTab);
        let nextIndex = currentIndex;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % ACCOUNT_TABS.length;
        else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + ACCOUNT_TABS.length) % ACCOUNT_TABS.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = ACCOUNT_TABS.length - 1;
        else return;
        event.preventDefault();
        selectAccountTab(ACCOUNT_TABS[nextIndex], { focus: true });
    }

    function emitAuthChanged() {
        if (typeof onAuthChanged === 'function') {
            onAuthChanged(state.currentUser, state.socketAuthToken);
        }
    }

    function setMessage(message = '', type = 'info') {
        const { message: messageEl } = getAuthViewElements();
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.dataset.type = type;
    }

    function setMode(nextMode) {
        if (state.currentUser) {
            renderUser();
            return;
        }
        state.mode = nextMode === 'register' ? 'register' : 'login';
        const els = getAuthViewElements();
        if (els.title) els.title.textContent = state.mode === 'register' ? 'Creează cont' : 'Autentificare';
        if (els.subtitle) {
            els.subtitle.textContent = state.mode === 'register'
                ? 'Creează un cont pentru profil, statistici și dueluri cu prieteni.'
                : 'Intră în cont ca să pregătim profilul și jocurile cu prieteni.';
        }
        if (els.usernameGroup) els.usernameGroup.classList.toggle('is-hidden', state.mode !== 'register');
        if (els.submitBtn) els.submitBtn.textContent = state.mode === 'register' ? 'Creează cont' : 'Login';
        if (els.switchBtn) {
            els.switchBtn.textContent = state.mode === 'register' ? 'Ai deja cont? Login' : 'Nu ai cont? Register';
        }
        setMessage('');
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

    function renderUser() {
        const els = getAuthViewElements();
        const isAuthenticated = Boolean(state.currentUser);
        const label = state.currentUser ? `👤 ${state.currentUser.username}` : '👤 Login';
        if (els.openBtn) els.openBtn.textContent = label;
        if (els.userBadge) {
            els.userBadge.textContent = state.currentUser
                ? `Logat ca ${state.currentUser.username}`
                : 'Joci momentan ca Guest.';
        }
        if (els.form) els.form.classList.toggle('is-hidden', isAuthenticated);
        if (els.accountView) els.accountView.classList.toggle('is-hidden', !isAuthenticated);
        if (els.switchBtn) els.switchBtn.classList.toggle('is-hidden', isAuthenticated);
        if (els.logoutBtn) els.logoutBtn.classList.toggle('is-hidden', !isAuthenticated);

        if (!isAuthenticated) return;
        if (els.title) els.title.textContent = 'Contul meu';
        if (els.subtitle) els.subtitle.textContent = 'Profilul și statisticile tale F1 Guesser Duel.';
        state.selectedAvatarKey = settingsController.normalizeAvatarKey(state.currentUser.avatarKey);
        settingsController.renderAvatarSelection();
        if (els.accountUsername) els.accountUsername.textContent = state.currentUser.username || 'Utilizator';
        if (els.accountEmail) els.accountEmail.textContent = state.currentUser.email || '';
        if (els.accountMemberSince) els.accountMemberSince.textContent = formatMemberSince(state.currentUser.createdAt);
        if (els.settingsUsername && els.settingsUsername.dataset.dirty !== 'true') {
            els.settingsUsername.value = state.currentUser.username || '';
        }
        settingsController.renderUsernameCooldown();
        selectAccountTab(state.selectedAccountTab);
    }

    function openPanel() {
        const els = getAuthViewElements();
        if (els.panel) els.panel.classList.add('show');
        if (els.backdrop) els.backdrop.classList.add('show');
        renderUser();
        if (state.currentUser) dashboardView.refreshAccountSummary();
        else setMode(state.mode);
        els.openBtn?.setAttribute?.('aria-expanded', 'true');
        if (dialogFocusManager) {
            dialogFocusManager.activate({
                focusTarget: state.currentUser ? els.closeBtn : (els.email || els.closeBtn)
            });
        } else {
            if (els.panel) els.panel.inert = false;
            els.panel?.setAttribute?.('aria-hidden', 'false');
        }
    }

    function closePanel() {
        const els = getAuthViewElements();
        if (els.panel) els.panel.classList.remove('show');
        if (els.backdrop) els.backdrop.classList.remove('show');
        els.openBtn?.setAttribute?.('aria-expanded', 'false');
        if (dialogFocusManager) {
            dialogFocusManager.deactivate({ fallbackFocus: els.openBtn });
        } else {
            if (els.panel) els.panel.inert = true;
            els.panel?.setAttribute?.('aria-hidden', 'true');
        }
    }

    async function refreshCurrentUser() {
        const requestedStateVersion = state.authStateVersion;
        try {
            const data = await authApi.me();
            if (requestedStateVersion !== state.authStateVersion) return;
            const previousUserId = state.currentUser?.id;
            state.currentUser = data.user || null;
            state.socketAuthToken = data.socketAuthToken || null;
            if (String(previousUserId ?? '') !== String(state.currentUser?.id ?? '')) {
                dashboardView.renderAccountDashboard();
            }
            renderUser();
            emitAuthChanged();
        } catch {
            if (requestedStateVersion !== state.authStateVersion) return;
            state.currentUser = null;
            state.socketAuthToken = null;
            dashboardView.renderAccountDashboard();
            renderUser();
            emitAuthChanged();
        }
    }

    async function submitAuthForm(event) {
        event.preventDefault();
        const requestedStateVersion = ++state.authStateVersion;
        const els = getAuthViewElements();
        const email = els.email ? els.email.value.trim() : '';
        const password = els.password ? els.password.value : '';
        const username = els.username ? els.username.value.trim() : '';
        try {
            setMessage('Se procesează...', 'info');
            const data = state.mode === 'register'
                ? await authApi.register({ username, email, password })
                : await authApi.login({ email, password });
            if (requestedStateVersion !== state.authStateVersion) return;
            state.currentUser = data.user || null;
            state.socketAuthToken = data.socketAuthToken || null;
            state.selectedAccountTab = 'overview';
            settingsController.resetAccountSettingsFields();
            dashboardView.renderAccountDashboard();
            renderUser();
            emitAuthChanged();
            setMessage(state.currentUser ? `Bun venit, ${state.currentUser.username}!` : 'Autentificare reușită.', 'success');
            if (els.password) els.password.value = '';
            setTimeout(closePanel, 500);
        } catch (error) {
            if (requestedStateVersion !== state.authStateVersion) return;
            setMessage(error.message || 'Nu am putut finaliza autentificarea.', 'error');
        }
    }

    function clearAuthenticatedState() {
        state.currentUser = null;
        state.socketAuthToken = null;
        state.selectedAccountTab = 'overview';
        settingsController.resetAccountSettingsFields({ clearUsername: true });
        dashboardView.renderAccountDashboard();
        renderUser();
        emitAuthChanged();
        setMode('login');
    }

    async function logout() {
        const requestedStateVersion = ++state.authStateVersion;
        try {
            await authApi.logout();
        } catch (error) {
            console.warn('Logout request failed:', error);
        }
        if (requestedStateVersion !== state.authStateVersion) return;
        clearAuthenticatedState();
        setMessage('Ai ieșit din cont.', 'success');
    }

    function setup() {
        const els = getAuthViewElements();
        if (els.openBtn) {
            els.openBtn.setAttribute?.('aria-haspopup', 'dialog');
            els.openBtn.setAttribute?.('aria-controls', 'authPanel');
            els.openBtn.setAttribute?.('aria-expanded', 'false');
        }
        if (!dialogFocusManager && els.panel) {
            dialogFocusManager = createDialogFocusManager({
                dialog: els.panel,
                onEscape: closePanel,
                getInitialFocus: () => state.currentUser ? els.closeBtn : (els.email || els.closeBtn)
            });
        }
        if (els.openBtn) els.openBtn.addEventListener('click', openPanel);
        if (els.closeBtn) els.closeBtn.addEventListener('click', closePanel);
        if (els.backdrop) els.backdrop.addEventListener('click', closePanel);
        if (els.switchBtn) {
            els.switchBtn.addEventListener('click', () => setMode(state.mode === 'register' ? 'login' : 'register'));
        }
        if (els.logoutBtn) els.logoutBtn.addEventListener('click', logout);

        const accountTabs = {
            overview: els.tabOverview,
            achievements: els.tabAchievements,
            stats: els.tabStats,
            history: els.tabHistory,
            settings: els.tabSettings
        };
        for (const [tabName, tab] of Object.entries(accountTabs)) {
            if (!tab) continue;
            tab.addEventListener('click', () => selectAccountTab(tabName));
            tab.addEventListener('keydown', handleAccountTabKeydown);
        }
        if (els.statsModeSingle) els.statsModeSingle.addEventListener('click', () => dashboardView.selectStatsMode('single'));
        if (els.statsModeDaily) els.statsModeDaily.addEventListener('click', () => dashboardView.selectStatsMode('daily'));
        if (els.statsModeDuel) els.statsModeDuel.addEventListener('click', () => dashboardView.selectStatsMode('duel'));
        if (els.form) els.form.addEventListener('submit', submitAuthForm);
        settingsController.setup();

        setMode('login');
        selectAccountTab('overview');
        refreshCurrentUser();
    }

    return {
        setup,
        refreshCurrentUser,
        getCurrentUser: () => state.currentUser,
        getSocketAuthToken: () => state.socketAuthToken,
        refreshAccountSummary: dashboardView.refreshAccountSummary,
        openPanel,
        closePanel
    };
}
