/**
 * Controlează ecranul inițial de alegere mod: Single Play, Duel sau Daily.
 * Nu pornește rundele direct, doar setează modul și lasă utilizatorul să aleagă dificultatea.
 */
export function createGameModeSelectionController({
	gameModeController,
	startDuelMode,
	startDailyChallenge,
	onSingleSelected
} = {}) {
	function getModeControls() {
		return Array.from(document.querySelectorAll('[data-game-mode-choice]'));
	}

	function getDifficultySection() {
		return document.getElementById('difficultySection');
	}

	function updateModeSelection(mode) {
		getModeControls().forEach(control => {
			const isActive = control.dataset.gameModeChoice === mode;
			control.classList.toggle('active', isActive);
			control.setAttribute('aria-pressed', String(isActive));
		});

		const difficultySection = getDifficultySection();
		if (difficultySection) {
			difficultySection.classList.toggle('is-hidden', mode === 'daily');
		}
	}

	function selectSingle() {
		gameModeController?.enterSingle?.();
		onSingleSelected?.();
		updateModeSelection('single');
		const status = document.getElementById('status');
		if (status) status.textContent = 'Single Play: selectează dificultatea pentru jocul solo.';
	}

	function selectDuel() {
		const roomId = startDuelMode?.();
		updateModeSelection('duel');
		const status = document.getElementById('status');
		if (status) {
			status.textContent = roomId
				? `Duel activ. Camera: ${roomId}. Selectează dificultatea când ești pregătit.`
				: 'Duel activ. Selectează dificultatea când ești pregătit.';
		}
	}

	function selectDaily(level = null) {
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
