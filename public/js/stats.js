/** Local browser statistics rendering. */
import { createTextElement, setTextContentById } from './domUtils.js';
import { setProgressPercent } from './progressStyle.js';
import { safeGetItem, safeRemoveItem, safeSetItem } from './safeStorage.js';

const EMPTY_DISTRIBUTION = Object.freeze({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });

function createEmptyDistribution() {
	return { ...EMPTY_DISTRIBUTION };
}

function asNonNegativeInteger(value) {
	const number = Number(value);
	return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function setStatsLabels({ title, streakLabel }) {
	setTextContentById('stats-title', title);
	setTextContentById('stat-streak-label', streakLabel);
}

/**
 * Citește statisticile locale din localStorage.
 * Dacă nu există statistici salvate, întoarce structura default.
 */
export function getStats() {
	const defaultStats = {
		played: 0,
		won: 0,
		streak: 0,
		distribution: createEmptyDistribution()
	};

	let stats = null;
	try {
		const rawStats = safeGetItem('f1-guesser-stats');
		stats = rawStats ? JSON.parse(rawStats) : null;
	} catch (error) {
		safeRemoveItem('f1-guesser-stats');
		return defaultStats;
	}

	if (!stats || typeof stats !== 'object') return defaultStats;
	if (!stats.distribution || typeof stats.distribution !== 'object') {
		stats.distribution = { ...defaultStats.distribution };
	}
	return stats;
}

/**
 * Convertește statisticile autoritative ale contului în formatul cardului.
 * Distribuția include toate modurile, la fel ca totalurile afișate.
 */
export function normalizeAccountStatsForCard(accountStats = {}) {
	const totals = accountStats?.totals && typeof accountStats.totals === 'object'
		? accountStats.totals
		: {};
	const modes = accountStats?.modes && typeof accountStats.modes === 'object'
		? Object.values(accountStats.modes)
		: [];
	const distribution = createEmptyDistribution();

	for (const mode of modes) {
		if (!mode?.distribution || typeof mode.distribution !== 'object') continue;
		for (let attemptNumber = 1; attemptNumber <= 6; attemptNumber++) {
			distribution[attemptNumber] += asNonNegativeInteger(mode.distribution[attemptNumber]);
		}
	}

	return {
		played: asNonNegativeInteger(totals.played),
		won: asNonNegativeInteger(totals.won),
		streak: asNonNegativeInteger(totals.bestStreak),
		distribution
	};
}

/**
 * Actualizează statisticile după finalul unui joc.
 * Pentru înfrângere se resetează streak-ul, iar pentru victorie se actualizează distribuția încercărilor.
 */
export function updateStats(isWin, attempts) {
	let stats = getStats();
	stats.played += 1;
	
	if (isWin) {
		stats.won += 1;
		stats.streak += 1;
		if (attempts >= 1 && attempts <= 6) {
			stats.distribution[attempts] = (stats.distribution[attempts] || 0) + 1;
		}
	} else {
		stats.streak = 0; // Resetăm streak-ul la înfrângere
	}
	
	safeSetItem('f1-guesser-stats', JSON.stringify(stats));
}

/** Calculează procentul de victorii, rotunjit la cel mai apropiat întreg. */
export function calculateWinRate(stats) {
	return stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
}

/** Returnează valoarea maximă din distribuție; minim 1 pentru a evita împărțirea la zero. */
export function getMaxDistributionValue(distribution) {
	return Math.max(...Object.values(distribution), 1);
}

/** Calculează lățimea barei de distribuție în procente. */
export function calculateDistributionBarWidth(count, maxDistributionValue) {
	return count > 0 ? Math.max(10, Math.round((count / maxDistributionValue) * 100)) : 8;
}

/** Creează un rând din graficul de distribuție a încercărilor. */
export function createDistributionRow(attemptNumber, count, barWidth) {
	const row = document.createElement('div');
	row.className = 'dist-row';

	const label = createTextElement('div', 'dist-label', attemptNumber);
	const barContainer = document.createElement('div');
	barContainer.className = 'dist-bar-container';

	const bar = createTextElement('div', 'dist-bar', count);
	setProgressPercent(bar, barWidth);

	barContainer.appendChild(bar);
	row.append(label, barContainer);
	return row;
}

/** Actualizează sumarul statisticilor: jucate, win rate și streak. */
export function renderStatsSummary(stats) {
	setTextContentById('stat-played', stats.played);
	setTextContentById('stat-winrate', `${calculateWinRate(stats)}%`);
	setTextContentById('stat-streak', stats.streak);
}

/** Randează toate cele 6 bare din distribuția încercărilor. */
export function renderGuessDistribution(distribution) {
	const distributionContainer = document.getElementById('guess-distribution');
	if (!distributionContainer) return;

	distributionContainer.replaceChildren();
	const maxDistributionValue = getMaxDistributionValue(distribution);

	for (let attemptNumber = 1; attemptNumber <= 6; attemptNumber++) {
		const count = distribution[attemptNumber] || 0;
		const barWidth = calculateDistributionBarWidth(count, maxDistributionValue);
		distributionContainer.appendChild(
			createDistributionRow(attemptNumber, count, barWidth)
		);
	}
}

/** Funcție centrală pentru redesenarea statisticilor din popup-ul de final. */
export function renderStats() {
	const stats = getStats();
	setStatsLabels({
		title: '📊 STATISTICI LOCALE',
		streakLabel: 'Curent Streak'
	});
	renderStatsSummary(stats);
	renderGuessDistribution(stats.distribution);
}

/** Randează statisticile persistate de server pentru utilizatorul autentificat. */
export function renderAccountStats(accountStats) {
	const stats = normalizeAccountStatsForCard(accountStats);
	setStatsLabels({
		title: '📊 STATISTICI CONT',
		streakLabel: 'Best Streak'
	});
	renderStatsSummary(stats);
	renderGuessDistribution(stats.distribution);
}

/** Evită afișarea temporară a statisticilor locale cât timp serverul răspunde. */
export function renderAccountStatsPending() {
	setStatsLabels({
		title: '📊 SE SINCRONIZEAZĂ STATISTICILE CONTULUI…',
		streakLabel: 'Best Streak'
	});
	setTextContentById('stat-played', '…');
	setTextContentById('stat-winrate', '…');
	setTextContentById('stat-streak', '…');
	document.getElementById('guess-distribution')?.replaceChildren();
}
