import { DEFAULT_TIME_LIMIT_SECONDS, normalizeTimeLimitSeconds } from './constants.js';
import { safeGetItem, safeSetItem } from './safeStorage.js';

/** Controller pentru UI-ul timerului și preferința locală a hostului. */
export function createTimerView({ getSocket, isRoundFinished, onHostOnlyMessage }) {
	let isCurrentRoomHost = false;
	let isTimedModeEnabled = safeGetItem('f1-guesser-timed-mode') === 'on';
	let selectedTimeLimitSeconds = Number(safeGetItem('f1-guesser-time-limit')) || DEFAULT_TIME_LIMIT_SECONDS;
	let currentRoundTimed = false;
	let currentTimeLimitSeconds = DEFAULT_TIME_LIMIT_SECONDS;
	let areRoundSettingsLocked = false;
	let roundTimerInterval = null;
	let roundTimerEndsAt = null;

	function buildRoundOptions(level) {
		return {
			level,
			timed: isTimedModeEnabled,
			timeLimitSeconds: selectedTimeLimitSeconds
		};
	}

	function buildRestartOptions() {
		return {
			timed: isTimedModeEnabled,
			timeLimitSeconds: selectedTimeLimitSeconds
		};
	}

	function getTimerControlValue(control) {
		return control.dataset.timerMode || control.dataset.timer;
	}

	function syncTimerModeControls() {
		document.querySelectorAll("[data-timer-mode], .timer-item").forEach(control => {
			const value = getTimerControlValue(control);
			const isOffControl = value === "off";
			const controlSeconds = normalizeTimeLimitSeconds(value);
			const isActive = isOffControl
				? !isTimedModeEnabled
				: isTimedModeEnabled && controlSeconds === selectedTimeLimitSeconds;
			control.classList.toggle("active", isActive);
		});
		updateTimerControlsLock();
	}

	function updateTimerControlsLock() {
		const isLocked = !isCurrentRoomHost || areRoundSettingsLocked;
		document.querySelectorAll("[data-timer-mode], .timer-item").forEach(control => {
			control.classList.toggle("is-locked", isLocked);
			control.setAttribute("aria-disabled", String(isLocked));

			if ("disabled" in control) {
				control.disabled = isLocked;
			}

			control.title = isLocked
				? (areRoundSettingsLocked ? "Setările pot fi schimbate după finalul rundei." : "Doar hostul camerei poate modifica timerul.")
				: "";
		});

		document.querySelectorAll(".timer-mode-card").forEach(card => {
			card.classList.toggle("timer-locked", isLocked);
		});
	}

	function setHostStatus(isHost) {
		isCurrentRoomHost = Boolean(isHost);
		updateTimerControlsLock();
	}

	function setRoundSettingsLocked(isLocked) {
		areRoundSettingsLocked = Boolean(isLocked);
		updateTimerControlsLock();
	}

	function applySelectedTimerSettings(enabled, timeLimitSeconds = selectedTimeLimitSeconds, options = {}) {
		isTimedModeEnabled = Boolean(enabled);
		selectedTimeLimitSeconds = normalizeTimeLimitSeconds(timeLimitSeconds);

		if (options.persist !== false) {
			safeSetItem('f1-guesser-timed-mode', isTimedModeEnabled ? 'on' : 'off');
			safeSetItem('f1-guesser-time-limit', String(selectedTimeLimitSeconds));
		}

		syncTimerModeControls();
	}

	function setTimedMode(enabled, timeLimitSeconds = selectedTimeLimitSeconds) {
		if (areRoundSettingsLocked) {
			const status = document.getElementById("status");
			if (status) status.textContent = "Setările pot fi schimbate după finalul rundei.";
			syncTimerModeControls();
			return;
		}

		if (!isCurrentRoomHost) {
			onHostOnlyMessage?.();
			syncTimerModeControls();
			return;
		}

		applySelectedTimerSettings(enabled, timeLimitSeconds, { persist: true });

		const status = document.getElementById("status");
		if (status && !isRoundFinished()) {
			status.textContent = enabled
				? `Modul cu timp (${selectedTimeLimitSeconds}s) va fi folosit la următorul joc.`
				: "Modul fără timp va fi folosit la următorul joc.";
		}
	}

	function getRoundTimerElement() {
		return document.getElementById("roundTimer");
	}

	function stopRoundTimer() {
		if (roundTimerInterval) {
			clearInterval(roundTimerInterval);
			roundTimerInterval = null;
		}
		roundTimerEndsAt = null;
	}

	function hideRoundTimer() {
		stopRoundTimer();
		currentRoundTimed = false;
		const timerEl = getRoundTimerElement();
		if (timerEl) {
			timerEl.classList.add("is-hidden");
			timerEl.classList.remove("timer-warning", "timer-danger");
			timerEl.style.setProperty("--timer-progress", "0%");
		}

		const timerValue = document.getElementById("roundTimerValue");
		if (timerValue) timerValue.textContent = `${selectedTimeLimitSeconds}s`;
	}

	function updateRoundTimerDisplay(secondsLeft, progressRatio = 0) {
		const timerEl = getRoundTimerElement();
		if (!timerEl) return;

		const safeSecondsLeft = Math.max(0, secondsLeft);
		const safeProgress = Math.min(1, Math.max(0, progressRatio));
		const timerValue = document.getElementById("roundTimerValue");

		if (timerValue) timerValue.textContent = `${safeSecondsLeft}s`;
		timerEl.style.setProperty("--timer-progress", `${safeProgress * 100}%`);
		timerEl.classList.toggle("timer-warning", safeSecondsLeft <= 15 && safeSecondsLeft > 5);
		timerEl.classList.toggle("timer-danger", safeSecondsLeft <= 5);
	}

	function startRoundTimer(timeLimitSeconds, roundStartedAt) {
		hideRoundTimer();

		currentRoundTimed = true;
		currentTimeLimitSeconds = timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS;
		const startedAt = roundStartedAt || Date.now();
		roundTimerEndsAt = startedAt + currentTimeLimitSeconds * 1000;

		const timerEl = getRoundTimerElement();
		if (timerEl) timerEl.classList.remove("is-hidden");

		function tick() {
			const msLeft = Math.max(0, roundTimerEndsAt - Date.now());
			const secondsLeft = Math.ceil(msLeft / 1000);
			const progressRatio = 1 - (msLeft / (currentTimeLimitSeconds * 1000));
			updateRoundTimerDisplay(secondsLeft, progressRatio);

			if (secondsLeft <= 0) {
				stopRoundTimer();
				const socket = getSocket();
				if (!isRoundFinished() && socket) socket.emit('timeExpired');
			}
		}

		tick();
		roundTimerInterval = setInterval(tick, 250);
	}

	return {
		buildRoundOptions,
		buildRestartOptions,
		syncTimerModeControls,
		setHostStatus,
		setRoundSettingsLocked,
		setTimedMode,
		applySelectedTimerSettings,
		startRoundTimer,
		hideRoundTimer,
		stopRoundTimer,
		isHost: () => isCurrentRoomHost,
		isTimedModeEnabled: () => isTimedModeEnabled,
		getSelectedTimeLimitSeconds: () => selectedTimeLimitSeconds,
		getCurrentRoundTimed: () => currentRoundTimed
	};
}
