export const GAME_MODES = Object.freeze({
	SINGLE: 'single',
	DUEL: 'duel',
	DAILY: 'daily'
});

const MODE_CLASS_NAMES = {
	[GAME_MODES.SINGLE]: 'mode-single',
	[GAME_MODES.DUEL]: 'mode-duel',
	[GAME_MODES.DAILY]: 'mode-daily'
};

function normalizeMode(mode) {
	if (Object.values(GAME_MODES).includes(mode)) return mode;
	return GAME_MODES.SINGLE;
}

function applyModeToDocument(mode) {
	if (typeof document === 'undefined') return;
	const body = document.body;
	if (!body) return;

	Object.values(MODE_CLASS_NAMES).forEach(className => body.classList.remove(className));
	body.classList.add(MODE_CLASS_NAMES[mode]);
	body.dataset.gameMode = mode;

	/* Compatibilitate cu CSS-ul existent până când mutăm complet stilurile pe mode-* */
	body.classList.toggle('daily-active', mode === GAME_MODES.DAILY);
}

export function createGameModeController({ onModeChanged } = {}) {
	let currentMode = GAME_MODES.SINGLE;
	let previousNonDailyMode = GAME_MODES.SINGLE;
	let context = {};

	function setMode(mode, nextContext = {}) {
		const normalizedMode = normalizeMode(mode);
		const previousMode = currentMode;

		if (normalizedMode !== GAME_MODES.DAILY) {
			previousNonDailyMode = normalizedMode;
		}

		currentMode = normalizedMode;
		context = { ...nextContext };
		applyModeToDocument(currentMode);

		if (previousMode !== currentMode) {
			onModeChanged?.({
				mode: currentMode,
				previousMode,
				context: { ...context }
			});
		}

		return currentMode;
	}

	function enterSingle(nextContext = {}) {
		return setMode(GAME_MODES.SINGLE, nextContext);
	}

	function enterDuel(nextContext = {}) {
		return setMode(GAME_MODES.DUEL, nextContext);
	}

	function enterDaily(nextContext = {}) {
		return setMode(GAME_MODES.DAILY, nextContext);
	}

	function exitDaily(fallbackMode = previousNonDailyMode) {
		if (currentMode !== GAME_MODES.DAILY) return currentMode;
		return setMode(fallbackMode || GAME_MODES.SINGLE);
	}

	function reset(nextMode = GAME_MODES.SINGLE, nextContext = {}) {
		previousNonDailyMode = nextMode === GAME_MODES.DAILY ? GAME_MODES.SINGLE : normalizeMode(nextMode);
		return setMode(nextMode, nextContext);
	}

	function getMode() {
		return currentMode;
	}

	function getContext() {
		return { ...context };
	}

	function isMode(mode) {
		return currentMode === mode;
	}

	return {
		modes: GAME_MODES,
		setMode,
		enterSingle,
		enterDuel,
		enterDaily,
		exitDaily,
		reset,
		getMode,
		getContext,
		isSingle: () => isMode(GAME_MODES.SINGLE),
		isDuel: () => isMode(GAME_MODES.DUEL),
		isDaily: () => isMode(GAME_MODES.DAILY)
	};
}
