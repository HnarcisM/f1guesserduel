/**
 * Controlează navigarea din Game Hub către configurarea Classic, Daily sau Duel.
 * Catalogul și configurarea sunt două stări distincte ale aceluiași overlay.
 */
const MODE_PRESENTATION = Object.freeze({
	single: Object.freeze({
		icon: '🎯',
		eyebrow: 'Mod clasic',
		title: 'Classic',
		description: 'Experiența originală F1 Guesser, configurată exact cum preferi.'
	}),
	daily: Object.freeze({
		icon: '🌅',
		eyebrow: 'Provocarea zilei',
		title: 'Daily Challenge',
		description: 'Aceeași provocare zilnică pentru fiecare dificultate.'
	}),
	duel: Object.freeze({
		icon: '⚔️',
		eyebrow: 'Joc multiplayer',
		title: 'Duel',
		description: 'Intră într-o cameră existentă sau creează una pentru prietenii tăi.'
	})
});

function setViewVisible(element, visible) {
	if (!element) return;
	element.classList.toggle('is-hidden', !visible);
	element.setAttribute?.('aria-hidden', String(!visible));
	element.inert = !visible;
}

export function createGameModeSelectionController({
	gameModeController,
	startDuelMode,
	startDailyChallenge,
	isDailyAvailable,
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

	function getDuelRoomBrowserPanel() {
		return document.getElementById('duelRoomBrowserPanel');
	}

	function getCatalogView() {
		return document.getElementById('gameHubCatalogView');
	}

	function getSetupView() {
		return document.getElementById('gameHubSetupView');
	}

	function hideDuelRoomBrowserPanel() {
		setViewVisible(getDuelRoomBrowserPanel(), false);
	}

	function updateSelectedModeSummary(mode) {
		const presentation = MODE_PRESENTATION[mode] || MODE_PRESENTATION.single;
		const icon = document.getElementById('gameHubSelectedIcon');
		const eyebrow = document.getElementById('gameHubSelectedEyebrow');
		const title = document.getElementById('gameHubSelectedTitle');
		const description = document.getElementById('gameHubSelectedDescription');
		const setupView = getSetupView();

		if (icon) icon.textContent = presentation.icon;
		if (eyebrow) eyebrow.textContent = presentation.eyebrow;
		if (title) title.textContent = presentation.title;
		if (description) description.textContent = presentation.description;
		if (setupView) setupView.dataset.selectedMode = mode;
	}

	function updateModeControls(mode = null) {
		getModeControls().forEach(control => {
			const isActive = Boolean(mode) && control.dataset.gameModeChoice === mode;
			control.classList.toggle('active', isActive);
			control.setAttribute('aria-pressed', String(isActive));
		});
	}

	function focusSetupSummary() {
		document.getElementById('gameHubSelectedSummary')?.focus?.({ preventScroll: true });
	}

	function updateModeSelection(mode, { focus = false } = {}) {
		updateModeControls(mode);
		updateSelectedModeSummary(mode);
		setViewVisible(getCatalogView(), false);
		setViewVisible(getSetupView(), true);

		const difficultySection = getDifficultySection();
		setViewVisible(difficultySection, mode === 'single');

		const dailyPanel = getDailyPanel();
		setViewVisible(dailyPanel, mode === 'daily');

		const duelPanel = getDuelRoomBrowserPanel();
		setViewVisible(duelPanel, mode === 'duel');

		if (focus) focusSetupSummary();
	}

	function showHub({ focus = false } = {}) {
		gameModeController?.enterSingle?.({ source: 'game-hub' });
		updateModeControls(null);
		setViewVisible(getDifficultySection(), false);
		setViewVisible(getDailyPanel(), false);
		hideDuelRoomBrowserPanel();
		setViewVisible(getSetupView(), false);
		setViewVisible(getCatalogView(), true);

		const status = document.getElementById('status');
		if (status) status.textContent = 'Alege un mod de joc din Game Hub.';

		if (focus) {
			document.querySelector?.('[data-game-mode-choice="single"]')?.focus?.({ preventScroll: true });
		}
	}

	function selectSingle() {
		const leaveResult = confirmDuelExit?.('single');
		if (leaveResult === false || leaveResult === 'to-lobby') return;
		gameModeController?.enterSingle?.();
		hideDuelRoomBrowserPanel();
		onSingleSelected?.();
		updateModeSelection('single', { focus: true });
		const status = document.getElementById('status');
		if (status) status.textContent = 'Classic: selectează timerul și dificultatea pentru jocul solo.';
	}

	function selectDuel(options = {}) {
		const requestedRoomId = options && typeof options === 'object' ? options.roomId : null;
		const shouldJoinDirectly = Boolean(requestedRoomId) || typeof onDuelBrowserRequested !== 'function';
		let roomId = null;

		updateModeSelection('duel', { focus: !requestedRoomId });

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
		updateModeSelection('daily', { focus: !level });
		if (level) {
			startDailyChallenge?.(level);
			return;
		}

		const status = document.getElementById('status');
		if (status) {
			status.textContent = isDailyAvailable?.() === false
				? 'Daily Challenge necesită autentificare. Intră în cont pentru a continua.'
				: 'Daily Challenge: alege dificultatea Daily.';
		}
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

		document.getElementById('gameHubBackBtn')?.addEventListener('click', () => {
			showHub({ focus: true });
		});
	}

	return {
		setup,
		showHub,
		selectSingle,
		selectDuel,
		selectDaily,
		updateModeSelection
	};
}
