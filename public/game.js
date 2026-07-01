import { createAutocomplete } from './js/autocomplete.js';
import { initializeGridStructure, renderGuessResult } from './js/gridView.js';
import { createTimerView } from './js/timerView.js';
import { createAuthView } from './js/authView.js';
import { renderLiveBoard, renderRoomScoreboard, resetLiveBoard, resetRoomScoreboard } from './js/liveBoardView.js';
import { createRoleState } from './js/roleState.js';
import { createDailyChallengeController } from './js/dailyChallengeController.js';
import { createEndGameController } from './js/endGameController.js';
import { createGameSocketController } from './js/gameSocketController.js';
import { clearRoomFromUrl, getRoomIdFromUrl, resetRoomUi, setupShareButton, setupRoom } from './js/roomController.js';
import { setupMenuControllers } from './js/menuController.js';
import { showErrorToast } from './js/toastController.js';
import { createGameModeController } from './js/gameModeController.js';
import { createGameModeSelectionController } from './js/gameModeSelectionController.js';

/**
 * F1 Guesser Duel - frontend entry point.
 *
 * game.js orchestrează modulele UI principale și păstrează doar starea de aplicație
 * care este partajată între Socket.IO, daily challenge, autocomplete și controllere.
 */

let socketController;
let driversList = [];
let isRoundFinished = false;
let authView;
let authReadyOnce = false;
let dailyChallengeController;
let autocomplete;
let endGameController;
let gameModeController;
let gameModeSelectionController;
let activeRoomId = null;
let isDuelRoundActive = false;


const roleState = createRoleState({
	onSpectatorModeChanged(isSpectator) {
		if (isSpectator) {
			renderLiveBoard({ roundState: 'playing', players: [] }, { forceVisible: true });
		} else {
			resetLiveBoard();
		}
	}
});

function setDriversList(drivers) {
	driversList = Array.isArray(drivers) ? drivers : [];
}

function setRoundFinished(value) {
	isRoundFinished = Boolean(value);
}

function showHostOnlyTimerMessage() {
	const status = document.getElementById('status');
	if (status) {
		status.textContent = roleState.isSpectator()
			? 'Ești spectator. Doar hostul poate modifica timerul.'
			: 'Doar hostul camerei poate modifica timerul.';
	}
}

function syncRoundSettingsLock() {
	const shouldLock = Boolean(gameModeController?.isDuel?.() && isDuelRoundActive);
	timer?.setRoundSettingsLocked?.(shouldLock);
	document.querySelectorAll('.btn-diff, .menu-item[data-level="easy"], .menu-item[data-level="medium"], .menu-item[data-level="hard"]').forEach(control => {
		control.classList.toggle('is-locked', shouldLock);
		control.setAttribute('aria-disabled', String(shouldLock));
		if ('disabled' in control) control.disabled = shouldLock;
		control.title = shouldLock ? 'Dificultatea poate fi schimbată după finalul rundei.' : '';
	});
}

function setDuelRoundState(roundState) {
	isDuelRoundActive = roundState === 'playing';
	syncRoundSettingsLock();
}

function isActiveDuelRound() {
	return Boolean(gameModeController?.isDuel?.() && isDuelRoundActive);
}

function isInDuelMode() {
	return Boolean(gameModeController?.isDuel?.());
}

function getDuelExitMessage(targetMode = 'single') {
	if (isActiveDuelRound()) {
		return 'Ești sigur că vrei să părăsești duelul? Runda va fi oprită pentru ambii jucători și vei părăsi camera.';
	}

	if (targetMode === 'daily') {
		return 'Ești sigur că vrei să părăsești camera de Duel și să intri în Daily Challenge?';
	}

	return 'Ești sigur că vrei să părăsești camera de Duel?';
}

function confirmDuelExit(targetMode = 'single') {
	/*
	 * Orice trecere din Duel către Home/Single/Daily înseamnă părăsirea camerei.
	 * Înainte verificam doar isActiveDuelRound(), iar dacă starea locală a rundei nu era
	 * sincronizată perfect, Home/F1 Guesser ajungea să facă reload. Acum interceptăm
	 * orice ieșire cât timp modul curent este Duel.
	 */
	if (!isInDuelMode()) return 'not-active';

	const shouldLeave = window.confirm(getDuelExitMessage(targetMode));
	if (!shouldLeave) return false;

	if (isActiveDuelRound()) {
		abortDuelRound();
	}
	enterSingleMode();

	const status = document.getElementById('status');
	if (status) {
		status.classList.remove('is-hidden');
		status.textContent = targetMode === 'daily'
			? 'Ai părăsit camera de Duel. Poți porni Daily Challenge.'
			: 'Ai părăsit camera de Duel.';
	}

	return 'left-duel';
}

function abortDuelRound() {
	socketController?.emit('abortDuelRound');
}

function showDuelLobby(message = 'Duelul a fost oprit. Alege dificultatea pentru o rundă nouă.') {
	setRoundFinished(true);
	setDuelRoundState('waiting');
	timer.hideRoundTimer();
	endGameController?.hideEndGamePopup?.(false);
	autocomplete?.clearSuggestions?.();
	autocomplete?.clearSelectedDriverId?.();
	const inputEl = document.getElementById('driverInput');
	if (inputEl) inputEl.value = '';
	const gameZone = document.getElementById('gameZone');
	if (gameZone) gameZone.classList.add('game-zone-hidden');
	const overlay = document.getElementById('difficulty-overlay');
	if (overlay) overlay.classList.remove('hidden');
	gameModeController?.enterDuel?.({ roomId: activeRoomId });
	gameModeSelectionController?.updateModeSelection?.('duel');
	const status = document.getElementById('status');
	if (status) {
		status.classList.remove('is-hidden');
		status.textContent = message;
	}
	const diffLabel = document.getElementById('diff-display-label');
	if (diffLabel) diffLabel.textContent = '';
}


const timer = createTimerView({
	getSocket: () => socketController?.getSocket?.() || null,
	isRoundFinished: () => isRoundFinished,
	onHostOnlyMessage: showHostOnlyTimerMessage
});

function createEndGameHandlers() {
	endGameController = createEndGameController({
		roleState,
		timer,
		dailyChallengeState: dailyChallengeController.state,
		getSocket: () => socketController?.getSocket?.() || null,
		getIsDailyMode: () => gameModeController?.isDaily?.() || dailyChallengeController.isMode(),
		getIsDuelMode: () => gameModeController?.isDuel?.() || false,
		getIsSingleMode: () => gameModeController?.isSingle?.() || false,
		getIsRoundFinished: () => isRoundFinished,
		setRoundFinished
	});
}

function sendGuess() {
	if (gameModeController?.isDuel?.() && !roleState.requirePlayer('Ești spectator. Poți urmări jocul, dar nu poți trimite încercări.')) return;

	if (endGameController.isRematchMode()) {
		endGameController.requestRematch();
		return;
	}

	if (isRoundFinished) return;

	const inputEl = document.getElementById('driverInput');
	if (!inputEl) return;
	const inputVal = inputEl.value.trim();
	const selectedDriverId = autocomplete.getSelectedDriverId();
	const finalDriver = driversList.find(d => d.id === selectedDriverId || d.name.toLowerCase() === inputVal.toLowerCase());
	if (!finalDriver) {
		showErrorToast('Te rog selectează un pilot valid din lista de predicții!');
		return;
	}

	const guessEvent = gameModeController?.isDaily?.()
		? 'submitDailyGuess'
		: gameModeController?.isSingle?.()
			? 'submitSingleGuess'
			: 'submitGuess';

	socketController?.emit(guessEvent, finalDriver.id);
	inputEl.value = '';
	autocomplete.clearSuggestions();
	autocomplete.clearSelectedDriverId();
}

function startDailyFromSelection(level) {
	if (confirmDuelExit('daily') === false) return;
	dailyChallengeController.start(level);
}

function startRoundFromSelection(level) {
	if (isActiveDuelRound()) {
		showErrorToast('Nu poți schimba dificultatea sau setările în timpul rundei. Așteaptă finalul rundei.');
		return;
	}

	dailyChallengeController.setStartPending(false);
	dailyChallengeController.setMode(false);
	if (gameModeController?.isDaily?.()) {
		gameModeController.exitDaily();
	}

	const overlay = document.getElementById('difficulty-overlay');
	if (overlay) overlay.classList.add('hidden');

	const roundOptions = timer.buildRoundOptions(level);
	const eventName = gameModeController?.isDuel?.() ? 'setDifficulty' : 'startSingleGame';

	if (gameModeController?.isDuel?.() && !roleState.requirePlayer('Ești spectator. Doar hostul poate porni jocul.')) return;

	if (!socketController?.emit(eventName, roundOptions)) {
		showErrorToast("Butonul funcționează, dar nu ești conectat la server! Pornește serverul cu 'npm start'");
	}
}

function enterSingleMode() {
	activeRoomId = null;
	clearRoomFromUrl();
	resetRoomUi();
	roleState.setSpectatorMode(false);
	timer.setHostStatus(true);
	setDuelRoundState('waiting');
	resetLiveBoard();
	socketController?.emit('leaveRoom');
	gameModeController.enterSingle();
}

function enterDuelMode(roomId = null) {
	const joinedRoomId = setupRoom({
		getSocket: socketController.getSocket,
		roomId,
		onRoomJoined: (nextRoomId) => {
			activeRoomId = nextRoomId;
			gameModeController.enterDuel({ roomId: nextRoomId });
		}
	});
	return joinedRoomId;
}

function handleAuthChangeWithoutLeavingRoom(currentUser, socketAuthToken = null) {
	if (!authReadyOnce) {
		authReadyOnce = true;
		return;
	}

	/*
	 * Nu reconectăm socket-ul după login/logout.
	 * Player-ul este legat de socket.id pe server, iar reconectarea în mijlocul
	 * unei runde scoate player-ul din cameră și poate șterge runda dacă era singur.
	 * Sincronizăm doar datele de profil ale socket-ului curent.
	 */
	dailyChallengeController.updateControls();

	socketController?.refreshAuthUser(socketAuthToken);
}

function setupAuth() {
	authView = createAuthView({
		onAuthChanged: handleAuthChangeWithoutLeavingRoom
	});
	authView.setup();
}

document.addEventListener('DOMContentLoaded', () => {
	gameModeController = createGameModeController({
		onModeChanged({ mode }) {
			if (mode === 'single') timer.setHostStatus(true);
			if (mode === 'daily') timer.setHostStatus(false);
			syncRoundSettingsLock();
		}
	});
	gameModeController.enterSingle();
	timer.setHostStatus(true);

	autocomplete = createAutocomplete({
		getDriversList: () => driversList,
		onSubmitGuess: sendGuess
	});

	dailyChallengeController = createDailyChallengeController({
		getCurrentUser: () => authView?.getCurrentUser?.() || null,
		getSocket: () => socketController?.getSocket?.() || null,
		roleState,
		timer,
		setDriversList,
		setRoundFinished,
		exitRematchMode: () => endGameController?.exitRematchMode?.(),
		initializeGridStructure,
		resetLiveBoard,
		resetRoomScoreboard,
		gameModeController
	});

	createEndGameHandlers();
	socketController = createGameSocketController({
		setDriversList,
		setRoundFinished,
		roleState,
		dailyChallengeController,
		gameModeController,
		endGameController,
		initializeGridStructure,
		renderGuessResult,
		renderLiveBoard,
		renderRoomScoreboard,
		resetLiveBoard,
		resetRoomScoreboard,
		setDuelRoundState,
		showDuelLobby,
		timer,
		autocomplete
	});
	setupMenuControllers({
		autocomplete,
		sendGuess,
		requestRematch: endGameController.requestRematch,
		hideEndGamePopup: endGameController.hideEndGamePopup,
		startRoundFromSelection,
		startDailyChallenge: startDailyFromSelection,
		confirmDuelExit,
		abortDuelRound,
		timer,
		showHostOnlyTimerMessage
	});
	dailyChallengeController.startCountdown();
	setupShareButton();
	setupAuth();
	socketController.connect();

	gameModeSelectionController = createGameModeSelectionController({
		gameModeController,
		startDuelMode: () => enterDuelMode(),
		startDailyChallenge: startDailyFromSelection,
		onSingleSelected: enterSingleMode,
		confirmDuelExit,
		abortDuelRound
	});
	gameModeSelectionController.setup();

	const roomIdFromUrl = getRoomIdFromUrl();
	if (roomIdFromUrl) {
		gameModeSelectionController.selectDuel();
	} else {
		gameModeSelectionController.selectSingle();
	}
});
