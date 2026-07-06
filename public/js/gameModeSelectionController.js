/**
 * Controlează ecranul inițial de alegere mod: Single Play, Duel sau Daily.
 * Nu pornește rundele direct, doar setează modul și lasă utilizatorul să aleagă dificultatea.
 */
export function createGameModeSelectionController({
	gameModeController,
	startDuelMode,
	startDailyChallenge,
	onDuelBrowserRequested,
	onSingleSelected,
	confirmDuelExit,
	abortDuelRound
} = {}) {
	function getModeControls() {
		return Array.from(document.querySelectorAll('[data-game-mode-choice]'));
	}

	function getDifficultySection() {
		return document.getElementById('difficultySection');
	}

	function getDailyPanel() {
		return document.getElementById('dailyChallengePanel');
	}

	function hideDuelRoomBrowserPanel() {
		const panel = document.getElementById('duelRoomBrowserPanel');
		if (!panel) return;
		panel.classList.add('is-hidden');
		panel.setAttribute('aria-hidden', 'true');
	}

	function updateModeSelection(mode) {
		getModeControls().forEach(control => {
			const isActive = control.dataset.gameModeChoice === mode;
			control.classList.toggle('active', isActive);
			control.setAttribute('aria-pressed', String(isActive));
		});

		const difficultySection = getDifficultySection();
		if (difficultySection) {
			difficultySection.classList.toggle('is-hidden', mode === 'daily' || mode === 'duel');
		}

		const dailyPanel = getDailyPanel();
		if (dailyPanel) {
			const showDailyPanel = mode === 'daily';
			dailyPanel.classList.toggle('is-hidden', !showDailyPanel);
			dailyPanel.setAttribute('aria-hidden', String(!showDailyPanel));
		}
	}

	function selectSingle() {
		const leaveResult = confirmDuelExit?.('single');
		if (leaveResult === false || leaveResult === 'to-lobby') return;
		gameModeController?.enterSingle?.();
		hideDuelRoomBrowserPanel();
		onSingleSelected?.();
		updateModeSelection('single');
		const status = document.getElementById('status');
		if (status) status.textContent = 'Single Play: selectează dificultatea pentru jocul solo.';
	}

	function selectDuel(options = {}) {
		const requestedRoomId = options && typeof options === 'object' ? options.roomId : null;
		const shouldJoinDirectly = Boolean(requestedRoomId) || typeof onDuelBrowserRequested !== 'function';
		let roomId = null;

		updateModeSelection('duel');

		if (shouldJoinDirectly) {
			roomId = startDuelMode?.(requestedRoomId || null);
			const overlay = document.getElementById('difficulty-overlay');
			if (overlay) overlay.classList.add('hidden');
		} else {
			onDuelBrowserRequested?.();
		}

		const status = document.getElementById('status');
		if (status) {
			status.textContent = roomId
				? `Duel activ. Camera: ${roomId}. Selectează dificultatea când ești pregătit.`
				: 'Duel: alege o cameră existentă sau creează una nouă.';
		}
	}

	function selectDaily(level = null) {
		const leaveResult = confirmDuelExit?.('daily');
		if (leaveResult === false || leaveResult === 'to-lobby') return;
		gameModeController?.enterDaily?.({ source: 'mode-selection' });
		hideDuelRoomBrowserPanel();
		updateModeSelection('daily');
		if (level) {
			startDailyChallenge?.(level);
			return;
		}

		const status = document.getElementById('status');
		if (status) status.textContent = 'Daily Challenge: alege dificultatea Daily.';
	}

	function setup() {
		getModeControls().forEach(control => {
			control.addEventListener('click', () => {
				const mode = control.dataset.gameModeChoice;
				if (mode === 'duel') {
					selectDuel();
					return;
				}
				if (mode === 'daily') {
					selectDaily();
					return;
				}
				selectSingle();
			});
		});
	}

	return {
		setup,
		selectSingle,
		selectDuel,
		selectDaily,
		updateModeSelection
	};
}
