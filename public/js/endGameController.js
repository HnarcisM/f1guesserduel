import { updateStats, renderStats } from './stats.js';
import { createDialogFocusManager } from './dialogFocusManager.js';

function setText(id, value) {
	const element = document.getElementById(id);
	if (element) element.textContent = value;
}

function setMessageWithStrong(messageElement, beforeText, strongText, afterText = '') {
	if (!messageElement) return;
	messageElement.replaceChildren();
	messageElement.append(document.createTextNode(beforeText));
	const strong = document.createElement('strong');
	strong.textContent = strongText;
	messageElement.append(strong);
	if (afterText) messageElement.append(document.createTextNode(afterText));
}

function appendDailyCountdown(messageElement, countdown) {
	if (!messageElement) return;
	messageElement.append(document.createElement('br'));
	const small = document.createElement('small');
	small.append(document.createTextNode('Daily Challenge poate fi refăcut după reset: '));
	const strong = document.createElement('strong');
	strong.textContent = countdown;
	small.append(strong, document.createTextNode('.'));
	messageElement.append(small);
}

export function createEndGameController({
	roleState,
	timer,
	dailyChallengeState,
	getSocket,
	getIsDailyMode,
	getIsDuelMode = () => true,
	getIsSingleMode = () => false,
	getIsRoundFinished,
	setRoundFinished
}) {
	let isRematchMode = false;
	let dialogFocusManager = null;

	function getDialogFocusManager() {
		if (dialogFocusManager) return dialogFocusManager;
		const popup = document.getElementById('endGameDisplay');
		if (!popup) return null;
		dialogFocusManager = createDialogFocusManager({
			dialog: popup,
			onEscape: () => hideEndGamePopup(true),
			getInitialFocus: () => document.getElementById('closeEndGamePopup')
		});
		return dialogFocusManager;
	}

	function setSubmitButtonMode(mode) {
		const sendBtn = document.getElementById('sendGuessBtn');
		if (!sendBtn) return;

		if (mode === 'rematch') {
			sendBtn.textContent = '🔄 Rematch';
			sendBtn.classList.add('rematch-submit-btn');
			sendBtn.disabled = false;
			sendBtn.removeAttribute?.('aria-disabled');
			return;
		}

		sendBtn.textContent = 'Trimite';
		sendBtn.classList.remove('rematch-submit-btn');
	}

	function enterRematchMode() {
		if (roleState.isSpectator()) return;
		isRematchMode = true;
		const gameZone = document.getElementById('gameZone');
		const status = document.getElementById('status');

		if (gameZone) {
			gameZone.classList.remove('game-zone-hidden');
			gameZone.classList.add('game-zone-rematch');
		}

		if (status) {
			status.classList.remove('is-hidden');
			status.textContent = 'Runda s-a terminat. Apasă Rematch pentru un pilot nou.';
		}

		setSubmitButtonMode('rematch');
	}

	function exitRematchMode() {
		isRematchMode = false;
		const gameZone = document.getElementById('gameZone');
		if (gameZone) gameZone.classList.remove('game-zone-rematch');
		setSubmitButtonMode('submit');
	}

	function requestRematch() {
		if (getIsDailyMode()) {
			const status = document.getElementById('status');
			if (status) {
				status.classList.remove('is-hidden');
				status.textContent = `Daily Challenge este disponibil din nou în ${dailyChallengeState.getCountdownText()}.`;
			}
			return;
		}

		if (getIsDuelMode() && !roleState.requirePlayer('Ești spectator. Doar hostul poate porni un rematch.')) return;

		const socket = getSocket();
		if (!socket) return;
		const restartEvent = getIsSingleMode() ? 'restartSingleGame' : 'restartGame';
		socket.emit(restartEvent, timer.buildRestartOptions());
	}

	function hideEndGamePopup(keepRematchAvailable = true) {
		const popup = document.getElementById('endGameDisplay');
		const backdrop = document.getElementById('endGameBackdrop');

		if (popup) popup.classList.remove('show');
		if (backdrop) backdrop.classList.remove('show');
		if (keepRematchAvailable && getIsRoundFinished() && !getIsDailyMode()) enterRematchMode();
		if (getIsDailyMode()) {
			const status = document.getElementById('status');
			if (status) {
				status.classList.remove('is-hidden');
				status.textContent = `Daily Challenge completat. Următorul Daily este disponibil în ${dailyChallengeState.getCountdownText()}.`;
			}
		}
		const fallbackFocus = isRematchMode
			? document.getElementById('sendGuessBtn')
			: document.getElementById('menu-hamburger');
		getDialogFocusManager()?.deactivate({
			fallbackFocus
		});
	}

	function showEndGamePopup({ isCorrect, attempts, target, isTimedOut = false, isDailyChallenge = false, customTitle = null, customMessage = null, statsResult = null, force = false }) {
		if (getIsRoundFinished() && !force) return;
		setRoundFinished(true);
		isRematchMode = false;
		timer.stopRoundTimer();

		const gameZone = document.getElementById('gameZone');
		const status = document.getElementById('status');
		if (gameZone) gameZone.classList.add('game-zone-hidden');
		if (status) status.classList.add('is-hidden');

		const popup = document.getElementById('endGameDisplay');
		const backdrop = document.getElementById('endGameBackdrop');
		const messageEl = document.getElementById('endGameMessage');
		if (!popup) return;

		popup.classList.remove('win-style', 'lose-style');

		if (customTitle || customMessage) {
			setText('endGameTitle', customTitle || (isCorrect ? '🏆 AI CÂȘTIGAT!' : '💀 AI PIERDUT!'));
			if (messageEl) messageEl.textContent = customMessage || '';
			popup.classList.add(isCorrect ? 'win-style' : 'lose-style');

			if (statsResult === 'loss') {
				updateStats(false, 0);
			} else if (isCorrect) {
				updateStats(true, attempts);
			} else {
				updateStats(false, 0);
			}
		} else if (isCorrect) {
			setText('endGameTitle', '🏆 AI CÂȘTIGAT!');
			setMessageWithStrong(
				messageEl,
				'Ai descoperit pilotul misterios în ',
				String(attempts),
				` ${attempts === 1 ? 'încercare' : 'încercări'}!`
			);
			popup.classList.add('win-style');
			updateStats(true, attempts);
		} else if (isTimedOut) {
			setText('endGameTitle', '⏱️ TIMP EXPIRAT!');
			setMessageWithStrong(
				messageEl,
				'Timpul s-a terminat. Pilotul misterios era: ',
				target ? target.name : 'Necunoscut'
			);
			popup.classList.add('lose-style');
			updateStats(false, 0);
		} else {
			setText('endGameTitle', '💀 AI PIERDUT!');
			setMessageWithStrong(
				messageEl,
				'Din păcate nu ai ghicit. Pilotul misterios era: ',
				target ? target.name : 'Necunoscut'
			);
			popup.classList.add('lose-style');
			updateStats(false, 0);
		}

		const restartBtn = document.getElementById('restartGameBtn');
		if (restartBtn) {
			restartBtn.classList.toggle('is-hidden', Boolean(isDailyChallenge));
		}

		if (isDailyChallenge) {
			appendDailyCountdown(messageEl, dailyChallengeState.getCountdownText());
		} else if (restartBtn) {
			restartBtn.classList.remove('is-hidden');
		}

		renderStats();
		if (backdrop) backdrop.classList.add('show');
		popup.classList.add('show');
		getDialogFocusManager()?.activate({
			focusTarget: document.getElementById('closeEndGamePopup')
		});
	}

	return {
		isRematchMode: () => isRematchMode,
		enterRematchMode,
		exitRematchMode,
		requestRematch,
		hideEndGamePopup,
		showEndGamePopup
	};
}
