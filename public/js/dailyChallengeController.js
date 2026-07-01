import { createDailyChallengeState } from './dailyChallengeState.js';
import { showErrorToast, showWarningToast } from './toastController.js';

const DAILY_LEVEL_LABELS = {
	easy: 'Easy',
	medium: 'Medium',
	hard: 'Hard'
};

function getDailyLevelLabel(level) {
	return DAILY_LEVEL_LABELS[level] || level;
}

function setStatusMessage(message, { show = true } = {}) {
	const status = document.getElementById('status');
	if (!status) return;
	if (show) status.classList.remove('is-hidden');
	status.textContent = message;
}

function hideDifficultyOverlay() {
	const overlay = document.getElementById('difficulty-overlay');
	if (overlay) overlay.classList.add('hidden');
}

function showDifficultyOverlay() {
	const overlay = document.getElementById('difficulty-overlay');
	if (overlay) overlay.classList.remove('hidden');
}

export function createDailyChallengeController({
	getCurrentUser,
	getSocket,
	roleState,
	timer,
	setDriversList,
	setRoundFinished,
	exitRematchMode,
	initializeGridStructure,
	resetLiveBoard
} = {}) {
	let isDailyMode = false;
	let isDailyStartPending = false;
	let currentDailyChallenge = null;

	const state = createDailyChallengeState({ getCurrentUser });

	function setStartPending(value) {
		isDailyStartPending = Boolean(value);
	}

	function setMode(value, challenge = null) {
		isDailyMode = Boolean(value);
		if (isDailyMode) isDailyStartPending = false;
		currentDailyChallenge = isDailyMode ? challenge : null;
		document.body.classList.toggle('daily-active', isDailyMode);

		if (isDailyMode) {
			roleState?.setSpectatorMode?.(false);
			resetLiveBoard?.();
		}
	}

	function showBlockedMessage(level) {
		const message = state.getBlockedMessage(level);
		setStatusMessage(message);
		showWarningToast(message, { duration: 5000 });
	}

	function complete(data = {}) {
		if (!isDailyMode) return;
		state.markCompleted({
			level: data.difficulty || currentDailyChallenge?.difficulty,
			challengeId: data.dailyChallengeId || currentDailyChallenge?.dailyChallengeId,
			dailyDate: data.dailyDate || currentDailyChallenge?.dailyDate
		});
	}

	function start(level) {
		if (!level) return;
		if (!state.canStart(level)) {
			showBlockedMessage(level);
			return;
		}

		isDailyStartPending = true;
		setMode(true, { difficulty: level });
		hideDifficultyOverlay();
		setStatusMessage(`Se pornește Daily Challenge ${getDailyLevelLabel(level)}...`);

		const badge = document.getElementById('duelStatus');
		if (badge) badge.innerText = 'Daily Challenge · Individual';

		const socket = getSocket?.();
		if (socket) {
			socket.emit('startDailyChallenge', {
				level,
				dailyDate: state.getTodayDateKey()
			});
			return;
		}

		isDailyStartPending = false;
		setMode(false);
		showErrorToast("Butonul funcționează, dar nu ești conectat la server! Porneste 'node server.js'");
	}

	function handleInit(data = {}) {
		hideDifficultyOverlay();
		setStartPending(false);
		setMode(true, {
			difficulty: data.difficulty,
			dailyDate: data.dailyDate,
			dailyChallengeId: data.dailyChallengeId
		});
		setDriversList?.(data.drivers);
		setRoundFinished?.(false);
		exitRematchMode?.();
		resetLiveBoard?.();
		timer?.hideRoundTimer?.();

		const diffLabel = document.getElementById('diff-display-label');
		if (diffLabel) {
			const dailyDate = data.dailyDate ? ` · ${data.dailyDate}` : '';
			diffLabel.innerText = `Daily Challenge · Mod: ${data.difficulty}${dailyDate}`;
			diffLabel.className = `diff-display-label difficulty-${data.difficulty} daily-mode`;
		}

		setStatusMessage('Daily Challenge individual: ghicește pilotul zilei. După finalizare, revine la următorul reset.');
		initializeGridStructure?.();

		const gameZone = document.getElementById('gameZone');
		if (gameZone) gameZone.classList.remove('game-zone-hidden');

		const badge = document.getElementById('duelStatus');
		if (badge) badge.innerText = 'Daily Challenge · Individual';
	}

	function handleError(message) {
		setStartPending(false);
		setMode(false);
		showDifficultyOverlay();
		if (message) showErrorToast(message);
	}

	return {
		state,
		start,
		complete,
		handleInit,
		handleError,
		setMode,
		setStartPending,
		isMode: () => isDailyMode,
		isStartPending: () => isDailyStartPending,
		startCountdown: state.startCountdown,
		updateControls: state.updateControls,
		getCountdownText: state.getCountdownText
	};
}
