const DAILY_CHALLENGE_VERSION = 'f1-daily-v1';
const DAILY_COMPLETION_PREFIX = 'f1-daily-completed';

const DAILY_LABELS = {
	easy: 'Daily Easy',
	medium: 'Daily Medium',
	hard: 'Daily Hard'
};

function getLocalDateKey(date = new Date()) {
	const source = date instanceof Date ? date : new Date(date);
	const year = source.getFullYear();
	const month = String(source.getMonth() + 1).padStart(2, '0');
	const day = String(source.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function getTodayChallengeId(level, date = new Date()) {
	return `${DAILY_CHALLENGE_VERSION}:${getLocalDateKey(date)}:${level}`;
}

function getCompletionStorageKey(challengeId, ownerKey) {
	return `${DAILY_COMPLETION_PREFIX}:${ownerKey}:${challengeId}`;
}

function getNextLocalMidnight(date = new Date()) {
	const nextMidnight = new Date(date);
	nextMidnight.setHours(24, 0, 0, 0);
	return nextMidnight.getTime();
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

	function getCurrentOwnerKey() {
		const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
		if (user && user.id !== undefined && user.id !== null) return `user:${user.id}`;
		if (user && user.email) return `email:${String(user.email).trim().toLowerCase()}`;
		if (user && user.username) return `username:${String(user.username).trim().toLowerCase()}`;
		return 'guest';
	}

	function isCompleted(level) {
		const challengeId = getTodayChallengeId(level);
		return Boolean(localStorage.getItem(getCompletionStorageKey(challengeId, getCurrentOwnerKey())));
	}

	function markCompleted({ level, challengeId, dailyDate }) {
		if (!level && challengeId) {
			level = challengeId.split(':').pop();
		}

		const finalChallengeId = challengeId || getTodayChallengeId(level);
		const ownerKey = getCurrentOwnerKey();
		localStorage.setItem(getCompletionStorageKey(finalChallengeId, ownerKey), JSON.stringify({
			completedAt: new Date().toISOString(),
			level,
			dailyDate: dailyDate || getLocalDateKey(),
			ownerKey
		}));
		updateControls();
	}

	function getCountdownText() {
		return formatDuration(getNextLocalMidnight() - Date.now());
	}

	function updateControl(control) {
		const level = control.dataset.dailyLevel;
		if (!level) return;

		const completed = isCompleted(level);
		const baseLabel = control.dataset.baseLabel || getLevelLabel(level);
		control.dataset.baseLabel = baseLabel;
		control.classList.toggle('daily-completed', completed);
		control.setAttribute('aria-disabled', completed ? 'true' : 'false');

		if (control.tagName === 'BUTTON') {
			control.disabled = completed;
		}

		if (completed) {
			control.textContent = `✅ ${baseLabel} · ${getCountdownText()}`;
			control.title = 'Daily Challenge completat. Revine la următorul reset zilnic.';
		} else {
			control.textContent = baseLabel;
			control.title = 'Pornește Daily Challenge individual.';
		}
	}

	function updateInfo() {
		const info = document.getElementById('dailyResetInfo');
		if (!info) return;
		info.textContent = `Individual, o dată pe zi per cont și dificultate. Reset în ${getCountdownText()}.`;
	}

	function updateControls() {
		document.querySelectorAll('[data-daily-level]').forEach(updateControl);
		updateInfo();
	}

	function startCountdown() {
		updateControls();
		if (intervalId) clearInterval(intervalId);
		intervalId = setInterval(updateControls, 1000);
	}

	function canStart(level) {
		return !isCompleted(level);
	}

	function getBlockedMessage() {
		return `Ai completat deja Daily Challenge pentru această dificultate pe acest cont. Următorul Daily este disponibil în ${getCountdownText()}.`;
	}

	return {
		canStart,
		isCompleted,
		markCompleted,
		getCountdownText,
		getBlockedMessage,
		getTodayDateKey: getLocalDateKey,
		startCountdown,
		updateControls
	};
}
