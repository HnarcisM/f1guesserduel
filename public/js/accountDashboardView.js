import { accountApi } from './apiClient.js';
import { setProgressPercent } from './progressStyle.js';

function asNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export function createAccountDashboardView({ state, getEls, onUserUpdated } = {}) {
    let selectedStatsMode = 'single';
    let currentAccountStats = {};

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
        const level = Math.max(1, asNonNegativeInteger(progress.level));
        const totalXp = asNonNegativeInteger(progress.totalXp);
        const xpIntoLevel = asNonNegativeInteger(progress.xpIntoLevel);
        const xpForLevel = Math.max(1, asNonNegativeInteger(progress.xpForLevel) || 100);
        const xpToNextLevel = asNonNegativeInteger(progress.xpToNextLevel)
            || Math.max(0, xpForLevel - xpIntoLevel);
        const progressPercent = Math.min(100, asNonNegativeInteger(progress.progressPercent));

        if (els.accountLevel) els.accountLevel.textContent = `Nivel ${level}`;
        if (els.totalXp) els.totalXp.textContent = `${totalXp} XP total`;
        if (els.levelProgressText) els.levelProgressText.textContent = `${xpIntoLevel} / ${xpForLevel} XP`;
        if (els.xpToNextLevel) els.xpToNextLevel.textContent = `${xpToNextLevel} XP până la nivelul ${level + 1}`;
        setProgressPercent(els.xpProgressBar, progressPercent);
        if (els.xpProgress) els.xpProgress.setAttribute('aria-valuenow', String(progressPercent));
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
            if (barElement) {
                setProgressPercent(
                    barElement,
                    count > 0 ? Math.max(8, Math.round((count / maximum) * 100)) : 0
                );
            }
        }
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
        if (achievementSummary) achievementSummary.textContent = `${unlockedCount} / ${items.length || 8} deblocate`;

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
            setProgressPercent(bar, progressPercent);
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
        if (!state.currentUser) return;
        if (expectedUserId !== null && String(state.currentUser.id) !== String(expectedUserId)) return;
        if (providedSummary) {
            renderAccountDashboard(providedSummary);
            return;
        }

        const requestedUserId = state.currentUser.id;
        const requestedStateVersion = state.authStateVersion;
        const els = getEls();
        if (els.accountStatsMessage) els.accountStatsMessage.textContent = 'Se încarcă statisticile…';
        try {
            const data = await accountApi.summary();
            if (requestedStateVersion !== state.authStateVersion
                || !state.currentUser
                || String(state.currentUser.id) !== String(requestedUserId)) return;
            if (data.user) state.currentUser = data.user;
            onUserUpdated?.();
            renderAccountDashboard(data);
        } catch (error) {
            if (requestedStateVersion !== state.authStateVersion
                || !state.currentUser
                || String(state.currentUser.id) !== String(requestedUserId)) return;
            if (els.accountStatsMessage) {
                els.accountStatsMessage.textContent = error.message || 'Statisticile nu au putut fi încărcate.';
            }
        }
    }

    return { renderAccountDashboard, refreshAccountSummary, selectStatsMode };
}
