import { setupDailyChallengeControls, setupMenu } from './navigationMenuController.js';
import { setupThemeMenu } from './themeMenuController.js';
import { setupTimerControls } from './timerControlsController.js';
import { setupGameControls } from './gameControlsController.js';
import { setupGlobalDocumentEvents } from './globalDocumentEventsController.js';

export {
	setupDailyChallengeControls,
	setupGameControls,
	setupGlobalDocumentEvents,
	setupMenu,
	setupThemeMenu,
	setupTimerControls
};

export function setupMenuControllers({
	autocomplete,
	sendGuess,
	requestRematch,
	hideEndGamePopup,
	startRoundFromSelection,
	startDailyChallenge,
	confirmDuelExit,
	abortDuelRound,
	timer,
	showHostOnlyTimerMessage,
	getIsDuelMode
}) {
	setupDailyChallengeControls({ startDailyChallenge });
	const menu = setupMenu({ startRoundFromSelection, startDailyChallenge, confirmDuelExit, abortDuelRound, getIsDuelMode });
	setupThemeMenu(menu);
	setupTimerControls(menu, { timer, showHostOnlyTimerMessage, getIsDuelMode });
	setupGameControls({
		autocomplete,
		sendGuess,
		requestRematch,
		hideEndGamePopup,
		startRoundFromSelection,
		startDailyChallenge
	});
	setupGlobalDocumentEvents(menu, {
		autocomplete,
		hideEndGamePopup,
		requestRematch
	});

	return menu;
}
