import { accountApi, authApi } from './apiClient.js';
import { createDialogFocusManager } from './dialogFocusManager.js';

const DEFAULT_AVATAR_KEY = 'helmet-red';
const AVATAR_PRESETS = Object.freeze([
    { key: 'helmet-red', elementId: 'authAvatarHelmetRed' },
    { key: 'helmet-blue', elementId: 'authAvatarHelmetBlue' },
    { key: 'helmet-yellow', elementId: 'authAvatarHelmetYellow' },
    { key: 'helmet-green', elementId: 'authAvatarHelmetGreen' },
    { key: 'helmet-orange', elementId: 'authAvatarHelmetOrange' },
    { key: 'helmet-purple', elementId: 'authAvatarHelmetPurple' },
    { key: 'helmet-cyan', elementId: 'authAvatarHelmetCyan' },
    { key: 'helmet-white', elementId: 'authAvatarHelmetWhite' }
]);

export function createAuthView({ onAuthChanged } = {}) {
    let currentUser = null;
    let socketAuthToken = null;
    let mode = 'login';
    let authStateVersion = 0;
    let selectedAccountTab = 'overview';
    let selectedStatsMode = 'single';
    let selectedAvatarKey = DEFAULT_AVATAR_KEY;
    let currentAccountStats = {};
    let dialogFocusManager = null;

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
            avatarPresetButtons: AVATAR_PRESETS.map(preset => ({
                key: preset.key,
                element: document.getElementById(preset.elementId)
            })),
            saveAvatarBtn: document.getElementById('authSaveAvatarBtn'),
            accountLevel: document.getElementById('authAccountLevel'),
            totalXp: document.getElementById('authTotalXp'),
            xpProgress: document.getElementById('authXpProgress'),
            xpProgressBar: document.getElementById('authXpProgressBar'),
            levelProgressText: document.getElementById('authLevelProgressText'),
            xpToNextLevel: document.getElementById('authXpToNextLevel'),
            tabOverview: document.getElementById('authTabOverview'),
            tabAchievements: document.getElementById('authTabAchievements'),
            tabStats: document.getElementById('authTabStats'),
            tabHistory: document.getElementById('authTabHistory'),
            tabSettings: document.getElementById('authTabSettings'),
            panelOverview: document.getElementById('authPanelOverview'),
            panelAchievements: document.getElementById('authPanelAchievements'),
            panelStats: document.getElementById('authPanelStats'),
            panelHistory: document.getElementById('authPanelHistory'),
            panelSettings: document.getElementById('authPanelSettings'),
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
            achievementSummary: document.getElementById('authAchievementSummary'),
            achievementGrid: document.getElementById('authAchievementGrid'),
            accountStatsMessage: document.getElementById('authAccountStatsMessage'),
            usernameSettingsForm: document.getElementById('authUsernameSettingsForm'),
            settingsUsername: document.getElementById('authSettingsUsername'),
            usernameCooldownHint: document.getElementById('authUsernameCooldownHint'),
            usernameCurrentPassword: document.getElementById('authUsernameCurrentPassword'),
            saveUsernameBtn: document.getElementById('authSaveUsernameBtn'),
            passwordSettingsForm: document.getElementById('authPasswordSettingsForm'),
            passwordCurrent: document.getElementById('authPasswordCurrent'),
            passwordNew: document.getElementById('authPasswordNew'),
            passwordConfirm: document.getElementById('authPasswordConfirm'),
            savePasswordBtn: document.getElementById('authSavePasswordBtn'),
            logoutAllBtn: document.getElementById('authLogoutAllBtn'),
            settingsMessage: document.getElementById('authSettingsMessage')
        };
    }

    function selectAccountTab(nextTab, { focus = false } = {}) {
        if (!['overview', 'achievements', 'stats', 'history', 'settings'].includes(nextTab)) return;
        selectedAccountTab = nextTab;
        const els = getEls();
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
            const isSelected = tabName === selectedAccountTab;
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

        if (focus && tabs[selectedAccountTab]?.focus) tabs[selectedAccountTab].focus();
    }

    function handleAccountTabKeydown(event) {
        const tabOrder = ['overview', 'achievements', 'stats', 'history', 'settings'];
        const currentIndex = tabOrder.indexOf(selectedAccountTab);
        let nextIndex = currentIndex;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabOrder.length;
        else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabOrder.length - 1;
        else return;
        event.preventDefault();
        selectAccountTab(tabOrder[nextIndex], { focus: true });
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

    function setSettingsMessage(message = '', type = 'info') {
        const { settingsMessage } = getEls();
        if (!settingsMessage) return;
        settingsMessage.textContent = message;
        settingsMessage.dataset.type = type;
    }

    function resetAccountSettingsFields({ clearUsername = false } = {}) {
        const els = getEls();
        if (els.settingsUsername) {
            els.settingsUsername.value = clearUsername ? '' : (currentUser?.username || '');
            els.settingsUsername.dataset.dirty = 'false';
        }
        if (els.usernameCurrentPassword) els.usernameCurrentPassword.value = '';
        if (els.passwordCurrent) els.passwordCurrent.value = '';
        if (els.passwordNew) els.passwordNew.value = '';
        if (els.passwordConfirm) els.passwordConfirm.value = '';
        if (els.saveUsernameBtn) els.saveUsernameBtn.disabled = false;
        if (els.savePasswordBtn) els.savePasswordBtn.disabled = false;
        if (els.logoutAllBtn) els.logoutAllBtn.disabled = false;
        setSettingsMessage('');
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
            selectedAvatarKey = normalizeAvatarKey(currentUser.avatarKey);
            renderAvatarSelection();
            if (els.accountUsername) els.accountUsername.textContent = currentUser.username || 'Utilizator';
            if (els.accountEmail) els.accountEmail.textContent = currentUser.email || '';
            if (els.accountMemberSince) {
                els.accountMemberSince.textContent = formatMemberSince(currentUser.createdAt);
            }
            if (els.settingsUsername && els.settingsUsername.dataset.dirty !== 'true') {
                els.settingsUsername.value = currentUser.username || '';
            }
            renderUsernameCooldown();
            selectAccountTab(selectedAccountTab);
        }
    }

    function renderUsernameCooldown() {
        const els = getEls();
        const availableAt = currentUser?.usernameChangeAvailableAt
            ? new Date(currentUser.usernameChangeAvailableAt)
            : null;
        const isLocked = availableAt && !Number.isNaN(availableAt.getTime())
            && availableAt.getTime() > Date.now();

        if (els.usernameCooldownHint) {
            els.usernameCooldownHint.classList.toggle('is-locked', Boolean(isLocked));
            els.usernameCooldownHint.textContent = isLocked
                ? `Următoarea schimbare este disponibilă pe ${new Intl.DateTimeFormat('ro-RO', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).format(availableAt)}.`
                : 'Schimbarea username-ului este disponibilă acum.';
        }
        if (els.settingsUsername) els.settingsUsername.disabled = Boolean(isLocked);
        if (els.usernameCurrentPassword) els.usernameCurrentPassword.disabled = Boolean(isLocked);
        if (els.saveUsernameBtn) els.saveUsernameBtn.disabled = !currentUser || Boolean(isLocked);
    }

    function normalizeAvatarKey(avatarKey) {
        const value = String(avatarKey || '').trim().toLowerCase();
        return AVATAR_PRESETS.some(preset => preset.key === value) ? value : DEFAULT_AVATAR_KEY;
    }

    function renderAvatarSelection() {
        const els = getEls();
        selectedAvatarKey = normalizeAvatarKey(selectedAvatarKey);
        if (els.accountAvatar) els.accountAvatar.dataset.avatarKey = selectedAvatarKey;

        for (const preset of els.avatarPresetButtons) {
            if (!preset.element) continue;
            preset.element.setAttribute('aria-pressed', String(preset.key === selectedAvatarKey));
        }

        if (els.saveAvatarBtn) {
            const savedAvatarKey = normalizeAvatarKey(currentUser?.avatarKey);
            els.saveAvatarBtn.disabled = !currentUser || selectedAvatarKey === savedAvatarKey;
        }
    }

    function selectAvatarPreset(avatarKey) {
        if (!currentUser) return;
        selectedAvatarKey = normalizeAvatarKey(avatarKey);
        renderAvatarSelection();
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

    function renderAccountProgress(progress = {}) {
        const els = getEls();
        const asNonNegativeInteger = value => {
            const number = Number(value);
            return Number.isSafeInteger(number) && number >= 0 ? number : 0;
        };
        const level = Math.max(1, asNonNegativeInteger(progress.level));
        const totalXp = asNonNegativeInteger(progress.totalXp);
        const xpIntoLevel = asNonNegativeInteger(progress.xpIntoLevel);
        const xpForLevel = Math.max(1, asNonNegativeInteger(progress.xpForLevel) || 100);
        const xpToNextLevel = asNonNegativeInteger(progress.xpToNextLevel) || Math.max(0, xpForLevel - xpIntoLevel);
        const progressPercent = Math.min(100, asNonNegativeInteger(progress.progressPercent));

        if (els.accountLevel) els.accountLevel.textContent = `Nivel ${level}`;
        if (els.totalXp) els.totalXp.textContent = `${totalXp} XP total`;
        if (els.levelProgressText) els.levelProgressText.textContent = `${xpIntoLevel} / ${xpForLevel} XP`;
        if (els.xpToNextLevel) {
            els.xpToNextLevel.textContent = `${xpToNextLevel} XP până la nivelul ${level + 1}`;
        }
        if (els.xpProgressBar) els.xpProgressBar.style.width = `${progressPercent}%`;
        if (els.xpProgress) els.xpProgress.setAttribute('aria-valuenow', String(progressPercent));
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

    function renderAchievements(achievements = []) {
        const { achievementGrid, achievementSummary } = getEls();
        if (!achievementGrid) return;
        achievementGrid.replaceChildren();

        const items = Array.isArray(achievements)
            ? achievements.filter(item => item && typeof item === 'object').slice(0, 8)
            : [];
        const unlockedCount = items.filter(item => item.unlocked === true).length;
        if (achievementSummary) {
            achievementSummary.textContent = `${unlockedCount} / ${items.length || 8} deblocate`;
        }

        for (const achievement of items) {
            const current = Math.max(0, Number(achievement.current) || 0);
            const target = Math.max(1, Number(achievement.target) || 1);
            const progressPercent = Math.min(100, Math.max(0, Number(achievement.progressPercent) || 0));
            const unlocked = achievement.unlocked === true;
            const card = document.createElement('article');
            const icon = document.createElement('span');
            const copy = document.createElement('div');
            const title = document.createElement('strong');
            const description = document.createElement('span');
            const progress = document.createElement('div');
            const track = document.createElement('i');
            const bar = document.createElement('b');
            const count = document.createElement('small');

            card.className = `auth-achievement-card${unlocked ? ' is-unlocked' : ''}`;
            card.setAttribute('aria-label', `${achievement.title || 'Achievement'}: ${unlocked ? 'deblocat' : 'blocat'}`);
            icon.className = 'auth-achievement-icon';
            icon.textContent = String(achievement.icon || '★').slice(0, 2);
            copy.className = 'auth-achievement-copy';
            title.textContent = achievement.title || 'Achievement';
            description.textContent = achievement.description || '';
            progress.className = 'auth-achievement-progress';
            bar.style.width = `${progressPercent}%`;
            count.textContent = unlocked ? 'Deblocat' : `${Math.min(current, target)} / ${target}`;
            track.appendChild(bar);
            copy.append(title, description);
            progress.append(track, count);
            card.append(icon, copy, progress);
            achievementGrid.appendChild(card);
        }
    }

    function renderAccountDashboard(summary = {}) {
        const stats = summary.stats || (summary.totals ? summary : {});
        renderAccountStats(stats);
        renderRecentGames(summary.recentGames || []);
        renderAccountProgress(summary.progress || {});
        renderAchievements(summary.achievements || []);
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
        const els = getEls();
        const { panel, backdrop } = els;
        if (panel) panel.classList.add('show');
        if (backdrop) backdrop.classList.add('show');
        renderUser();
        if (currentUser) refreshAccountSummary();
        else setMode(mode);
        els.openBtn?.setAttribute?.('aria-expanded', 'true');
        if (dialogFocusManager) {
            dialogFocusManager.activate({
                focusTarget: currentUser ? els.closeBtn : (els.email || els.closeBtn)
            });
        } else {
            if (panel) panel.inert = false;
            panel?.setAttribute?.('aria-hidden', 'false');
        }
    }

    function closePanel() {
        const els = getEls();
        const { panel, backdrop } = els;
        if (panel) panel.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
        els.openBtn?.setAttribute?.('aria-expanded', 'false');
        if (dialogFocusManager) {
            dialogFocusManager.deactivate({ fallbackFocus: els.openBtn });
        } else {
            if (panel) panel.inert = true;
            panel?.setAttribute?.('aria-hidden', 'true');
        }
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
            selectedAccountTab = 'overview';
            resetAccountSettingsFields();
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

    async function submitUsernameSettings(event) {
        event.preventDefault();
        if (!currentUser) return;
        const requestedStateVersion = ++authStateVersion;
        const els = getEls();
        const username = els.settingsUsername?.value.trim() || '';
        const currentPassword = els.usernameCurrentPassword?.value || '';
        if (els.saveUsernameBtn) els.saveUsernameBtn.disabled = true;
        if (els.accountStatsMessage) els.accountStatsMessage.textContent = '';
        setSettingsMessage('Se salvează username-ul…');

        try {
            const data = await accountApi.updateProfile({ username, currentPassword });
            if (requestedStateVersion !== authStateVersion || !currentUser) return;
            currentUser = data.user || currentUser;
            socketAuthToken = data.socketAuthToken || socketAuthToken;
            if (els.settingsUsername) els.settingsUsername.dataset.dirty = 'false';
            if (els.usernameCurrentPassword) els.usernameCurrentPassword.value = '';
            renderUser();
            emitAuthChanged();
            setSettingsMessage('Username-ul a fost actualizat.', 'success');
        } catch (error) {
            if (requestedStateVersion !== authStateVersion || !currentUser) return;
            setSettingsMessage(error.message || 'Username-ul nu a putut fi actualizat.', 'error');
        } finally {
            renderUsernameCooldown();
        }
    }

    async function submitPasswordSettings(event) {
        event.preventDefault();
        if (!currentUser) return;
        const els = getEls();
        const currentPassword = els.passwordCurrent?.value || '';
        const newPassword = els.passwordNew?.value || '';
        const confirmPassword = els.passwordConfirm?.value || '';
        if (newPassword !== confirmPassword) {
            setSettingsMessage('Confirmarea parolei nu coincide cu parola nouă.', 'error');
            return;
        }

        const requestedStateVersion = ++authStateVersion;
        if (els.savePasswordBtn) els.savePasswordBtn.disabled = true;
        if (els.accountStatsMessage) els.accountStatsMessage.textContent = '';
        setSettingsMessage('Se schimbă parola…');
        try {
            const data = await accountApi.updatePassword({ currentPassword, newPassword });
            if (requestedStateVersion !== authStateVersion || !currentUser) return;
            currentUser = data.user || currentUser;
            socketAuthToken = data.socketAuthToken || socketAuthToken;
            if (els.passwordCurrent) els.passwordCurrent.value = '';
            if (els.passwordNew) els.passwordNew.value = '';
            if (els.passwordConfirm) els.passwordConfirm.value = '';
            emitAuthChanged();
            const revokedCount = Number(data.sessionsRevoked) || 0;
            setSettingsMessage(
                revokedCount > 0
                    ? `Parola a fost schimbată. ${revokedCount} ${revokedCount === 1 ? 'altă sesiune a fost închisă' : 'alte sesiuni au fost închise'}.`
                    : 'Parola a fost schimbată.',
                'success'
            );
        } catch (error) {
            if (requestedStateVersion !== authStateVersion || !currentUser) return;
            setSettingsMessage(error.message || 'Parola nu a putut fi schimbată.', 'error');
        } finally {
            if (els.savePasswordBtn) els.savePasswordBtn.disabled = false;
        }
    }

    async function saveAvatar() {
        if (!currentUser) return;
        const requestedStateVersion = ++authStateVersion;
        const { saveAvatarBtn } = getEls();
        if (saveAvatarBtn) saveAvatarBtn.disabled = true;
        setSettingsMessage('Se salvează avatarul…');

        try {
            const data = await accountApi.updateAvatar({ avatarKey: selectedAvatarKey });
            if (requestedStateVersion !== authStateVersion || !currentUser) return;
            currentUser = data.user || currentUser;
            socketAuthToken = data.socketAuthToken || socketAuthToken;
            selectedAvatarKey = normalizeAvatarKey(currentUser.avatarKey);
            renderUser();
            emitAuthChanged();
            setSettingsMessage('Avatarul a fost actualizat.', 'success');
        } catch (error) {
            if (requestedStateVersion !== authStateVersion || !currentUser) return;
            setSettingsMessage(error.message || 'Avatarul nu a putut fi actualizat.', 'error');
            renderAvatarSelection();
        } finally {
            renderAvatarSelection();
        }
    }

    function clearAuthenticatedState() {
        currentUser = null;
        socketAuthToken = null;
        selectedAccountTab = 'overview';
        resetAccountSettingsFields({ clearUsername: true });
        renderAccountDashboard();
        renderUser();
        emitAuthChanged();
        setMode('login');
    }

    async function logoutEverywhere() {
        if (!currentUser) return;
        const confirmed = typeof globalThis.confirm === 'function'
            && globalThis.confirm('Sigur vrei să închizi toate sesiunile acestui cont?');
        if (!confirmed) return;

        const requestedStateVersion = ++authStateVersion;
        const { logoutAllBtn } = getEls();
        if (logoutAllBtn) logoutAllBtn.disabled = true;
        setSettingsMessage('Se închid toate sesiunile…');
        try {
            await accountApi.logoutAll();
            if (requestedStateVersion !== authStateVersion) return;
            clearAuthenticatedState();
            setMessage('Ai ieșit din cont pe toate dispozitivele.', 'success');
        } catch (error) {
            if (requestedStateVersion !== authStateVersion || !currentUser) return;
            setSettingsMessage(error.message || 'Sesiunile nu au putut fi închise.', 'error');
        } finally {
            if (logoutAllBtn) logoutAllBtn.disabled = false;
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

        clearAuthenticatedState();
        setMessage('Ai ieșit din cont.', 'success');
    }

    function setup() {
        const els = getEls();
        if (els.openBtn) {
            els.openBtn.setAttribute?.('aria-haspopup', 'dialog');
            els.openBtn.setAttribute?.('aria-controls', 'authPanel');
            els.openBtn.setAttribute?.('aria-expanded', 'false');
        }
        if (!dialogFocusManager && els.panel) {
            dialogFocusManager = createDialogFocusManager({
                dialog: els.panel,
                onEscape: closePanel,
                getInitialFocus: () => currentUser ? els.closeBtn : (els.email || els.closeBtn)
            });
        }
        if (els.openBtn) els.openBtn.addEventListener('click', openPanel);
        if (els.closeBtn) els.closeBtn.addEventListener('click', closePanel);
        if (els.backdrop) els.backdrop.addEventListener('click', closePanel);
        if (els.switchBtn) els.switchBtn.addEventListener('click', () => setMode(mode === 'register' ? 'login' : 'register'));
        if (els.logoutBtn) els.logoutBtn.addEventListener('click', logout);
        const accountTabs = [
            ['overview', els.tabOverview],
            ['achievements', els.tabAchievements],
            ['stats', els.tabStats],
            ['history', els.tabHistory],
            ['settings', els.tabSettings]
        ];
        for (const [tabName, tab] of accountTabs) {
            if (!tab) continue;
            tab.addEventListener('click', () => selectAccountTab(tabName));
            tab.addEventListener('keydown', handleAccountTabKeydown);
        }
        if (els.statsModeSingle) els.statsModeSingle.addEventListener('click', () => selectStatsMode('single'));
        if (els.statsModeDaily) els.statsModeDaily.addEventListener('click', () => selectStatsMode('daily'));
        if (els.statsModeDuel) els.statsModeDuel.addEventListener('click', () => selectStatsMode('duel'));
        if (els.form) els.form.addEventListener('submit', submitAuthForm);
        if (els.usernameSettingsForm) els.usernameSettingsForm.addEventListener('submit', submitUsernameSettings);
        if (els.passwordSettingsForm) els.passwordSettingsForm.addEventListener('submit', submitPasswordSettings);
        for (const preset of els.avatarPresetButtons) {
            preset.element?.addEventListener('click', () => selectAvatarPreset(preset.key));
        }
        if (els.saveAvatarBtn) els.saveAvatarBtn.addEventListener('click', saveAvatar);
        if (els.settingsUsername) {
            els.settingsUsername.addEventListener('input', () => { els.settingsUsername.dataset.dirty = 'true'; });
        }
        if (els.logoutAllBtn) els.logoutAllBtn.addEventListener('click', logoutEverywhere);

        setMode('login');
        selectAccountTab('overview');
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
