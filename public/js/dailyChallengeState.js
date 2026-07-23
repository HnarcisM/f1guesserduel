const DAILY_LABELS = {
	easy: 'Daily Easy',
	medium: 'Daily Medium',
	hard: 'Daily Hard'
};

function getUtcDateKey(date = new Date()) {
	const source = date instanceof Date ? date : new Date(date);
	const year = source.getUTCFullYear();
	const month = String(source.getUTCMonth() + 1).padStart(2, '0');
	const day = String(source.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function getNextUtcMidnight(date = new Date()) {
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function formatDuration(ms) {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getLevelLabel(level) {
	return DAILY_LABELS[level] || `Daily ${level}`;
}

export function createDailyChallengeState({ getCurrentUser } = {}) {
	let intervalId = null;
	let statusOwnerId = null;
	let serverDailyDate = null;
	let nextResetAt = null;
	let claimedDifficulties = new Set();
	let completedControls = [];
	let resetInfoControl = null;

	function getCurrentUserId() {
		const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
		return user?.id === undefined || user?.id === null ? null : String(user.id);
	}

	function isAuthenticated() {
		return getCurrentUserId() !== null;
	}

	function hasCurrentUserStatus() {
		return statusOwnerId !== null && statusOwnerId === getCurrentUserId();
	}

	function isCompleted(level) {
		return hasCurrentUserStatus() && claimedDifficulties.has(level);
	}

	function markStarted({ level, challengeId, dailyDate, resetAt } = {}) {
		if (!level && challengeId) {
			level = challengeId.split(':').pop();
		}
		if (!level || !isAuthenticated()) return;

		statusOwnerId = getCurrentUserId();
		claimedDifficulties.add(level);
		serverDailyDate = dailyDate || serverDailyDate || getUtcDateKey();
		const parsedResetAt = Date.parse(resetAt || '');
		if (Number.isFinite(parsedResetAt)) nextResetAt = parsedResetAt;
		updateControls();
	}

	function applyServerStatus(payload = {}) {
		if (!payload.authenticated || !isAuthenticated()) {
			statusOwnerId = null;
			claimedDifficulties = new Set();
			serverDailyDate = payload.dailyDate || null;
		} else {
			statusOwnerId = getCurrentUserId();
			claimedDifficulties = new Set(Array.isArray(payload.claimedDifficulties)
				? payload.claimedDifficulties.filter(level => Object.hasOwn(DAILY_LABELS, level))
				: []);
			serverDailyDate = payload.dailyDate || getUtcDateKey();
		}

		const parsedResetAt = Date.parse(payload.nextResetAt || '');
		nextResetAt = Number.isFinite(parsedResetAt) ? parsedResetAt : null;
		updateControls();
	}

	function clearExpiredStatus() {
		if (!nextResetAt || Date.now() < nextResetAt) return false;
		claimedDifficulties = new Set();
		serverDailyDate = null;
		nextResetAt = null;
		return true;
	}

	function getCountdownText() {
		clearExpiredStatus();
		return formatDuration((nextResetAt || getNextUtcMidnight()) - Date.now());
	}

	function setTextContent(control, text) {
		if (control && control.textContent !== text) {
			control.textContent = text;
		}
	}

	function updateControl(control, { authenticated, countdownText }) {
		const level = control.dataset.dailyLevel;
		if (!level) return false;

		const completed = authenticated && isCompleted(level);
		const baseLabel = control.dataset.baseLabel || getLevelLabel(level);
		control.dataset.baseLabel = baseLabel;
		control.classList.toggle('daily-completed', completed);
		control.classList.toggle('daily-auth-required', !authenticated);
		control.setAttribute('aria-disabled', completed || !authenticated ? 'true' : 'false');

		if (control.tagName === 'BUTTON') {
			control.disabled = completed || !authenticated;
		}

		if (!authenticated) {
			setTextContent(control, `🔒 ${baseLabel}`);
			control.title = 'Autentifică-te pentru a juca Daily Challenge.';
		} else if (completed) {
			setTextContent(control, `✅ ${baseLabel} · ${countdownText}`);
			control.title = 'Încercarea Daily a fost deja folosită. Revine la următorul reset UTC.';
		} else {
			setTextContent(control, baseLabel);
			control.title = 'Pornește Daily Challenge individual.';
		}

		return completed;
	}

	function updateInfo(info, { authenticated, countdownText }) {
		if (!info) return;
		info.classList.toggle('daily-auth-message', !authenticated);
		setTextContent(info, authenticated
			? `Individual, o încercare pe zi per cont și dificultate. Reset UTC în ${countdownText}.`
			: 'Autentifică-te pentru a debloca Daily Challenge și pentru a salva progresul.'
		);
	}

	function updateControls() {
		clearExpiredStatus();
		const authenticated = isAuthenticated();
		const countdownText = getCountdownText();
		completedControls = [];
		document.querySelectorAll('[data-daily-level]').forEach(control => {
			if (updateControl(control, { authenticated, countdownText })) {
				completedControls.push(control);
			}
		});
		const dailyModeControl = document.querySelector?.('[data-game-mode-choice="daily"]');
		if (dailyModeControl) {
			dailyModeControl.classList.toggle('daily-auth-required', !authenticated);
			dailyModeControl.title = authenticated
				? 'Deschide Daily Challenge.'
				: 'Autentifică-te pentru a juca Daily Challenge.';
		}
		resetInfoControl = document.getElementById('dailyResetInfo');
		updateInfo(resetInfoControl, { authenticated, countdownText });
	}

	function updateCountdownText() {
		if (clearExpiredStatus()) {
			updateControls();
			return;
		}

		if (!isAuthenticated()) return;

		const countdownText = formatDuration(
			(nextResetAt || getNextUtcMidnight()) - Date.now()
		);
		for (const control of completedControls) {
			const level = control.dataset.dailyLevel;
			const baseLabel = control.dataset.baseLabel || getLevelLabel(level);
			setTextContent(control, `✅ ${baseLabel} · ${countdownText}`);
		}
		setTextContent(
			resetInfoControl,
			`Individual, o încercare pe zi per cont și dificultate. Reset UTC în ${countdownText}.`
		);
	}

	function startCountdown() {
		updateControls();
		if (intervalId) clearInterval(intervalId);
		intervalId = setInterval(updateCountdownText, 1000);
	}

	function canStart(level) {
		return isAuthenticated() && !isCompleted(level);
	}

	function getBlockedMessage() {
		if (!isAuthenticated()) {
			return 'Autentifică-te pentru a juca Daily Challenge și a salva progresul.';
		}
		return `Ai folosit deja încercarea Daily pentru această dificultate. Următorul Daily este disponibil în ${getCountdownText()}.`;
	}

	return {
		applyServerStatus,
		canStart,
		isCompleted,
		isAuthenticated,
		markCompleted: markStarted,
		markStarted,
		getCountdownText,
		getBlockedMessage,
		getTodayDateKey: () => serverDailyDate || getUtcDateKey(),
		startCountdown,
		updateControls
	};
}
