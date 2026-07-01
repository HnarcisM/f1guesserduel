import { createAutocomplete } from './js/autocomplete.js';
import { initializeGridStructure, renderGuessResult } from './js/gridView.js';
import { createTimerView } from './js/timerView.js';
import { createAuthView } from './js/authView.js';
import { renderLiveBoard, renderRoomScoreboard, resetLiveBoard, resetRoomScoreboard } from './js/liveBoardView.js';
import { renderOpponentProgress, resetOpponentProgress } from './js/opponentProgressView.js';
import { renderDuelLobby, resetDuelLobby, setupDuelLobbyView } from './js/duelLobbyView.js';
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
let lastDuelRoomState = null;


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

function updateDuelRoomState(roomState = null) {
	lastDuelRoomState = roomState && typeof roomState === 'object' ? roomState : null;
	if (lastDuelRoomState?.roundState) {
		setDuelRoundState(lastDuelRoomState.roundState);
	}
}

function isDuelLobbyVisible() {
	const lobby = document.getElementById('duelLobbyPanel');
	return Boolean(lobby && !lobby.classList.contains('is-hidden'));
}

function isDuelGameUiActive() {
	const gameZone = document.getElementById('gameZone');
	return Boolean(gameZone && !gameZone.classList.contains('game-zone-hidden'));
}

function isActiveDuelRound() {
	if (!gameModeController?.isDuel?.()) return false;
	if (isDuelRoundActive || lastDuelRoomState?.roundState === 'playing') return true;
	/*
	 * Fallback UI guard: dacă suntem în Duel, lobby-ul nu este vizibil, iar zona
	 * de joc este încă activă, tratăm navigarea ca părăsire de rundă. Asta previne
	 * cazul în care starea locală roundState nu s-a sincronizat perfect înainte de
	 * click pe Home/F1 Guesser.
	 */
	return isDuelGameUiActive() && !isDuelLobbyVisible();
}

function isInDuelMode() {
	return Boolean(gameModeController?.isDuel?.());
}

function setGuessControlsVisible(isVisible) {
	const shouldShow = Boolean(isVisible) && !roleState.isSpectator();
	const gameZone = document.getElementById('gameZone');
	const inputEl = document.getElementById('driverInput');
	const sendBtn = document.getElementById('sendGuessBtn');

	if (gameZone) {
		gameZone.classList.toggle('game-zone-hidden', !shouldShow);
		gameZone.classList.toggle('is-player-finished', !shouldShow && Boolean(isVisible) === false);
	}

	if (inputEl) {
		inputEl.disabled = !shouldShow;
		if (!shouldShow) inputEl.value = '';
	}

	if (sendBtn) {
		sendBtn.disabled = !shouldShow;
	}

	if (!shouldShow) {
		autocomplete?.clearSuggestions?.();
		autocomplete?.clearSelectedDriverId?.();
	}
}

function hideGuessControlsAfterLocalFinish() {
	setGuessControlsVisible(false);
}

function showGuessControlsForActiveRound() {
	setGuessControlsVisible(true);
}

function getDuelExitMessage(targetMode = 'single') {
	if (isActiveDuelRound()) {
		return 'Ești sigur că vrei să oprești runda? Ambii jucători vor reveni în lobby-ul camerei.';
	}

	if (targetMode === 'daily') {
		return 'Ești sigur că vrei să părăsești camera de Duel și să intri în Daily Challenge?';
	}

	return 'Ești sigur că vrei să părăsești camera de Duel?';
}

function confirmDuelExit(targetMode = 'single') {
	/*
	 * Dacă există o rundă activă, ieșirea intenționată oprește runda și revine în lobby,
	 * nu scoate automat playerii din cameră. Din lobby, userul poate părăsi camera spre
	 * Single/Daily/Home.
	 */
	if (!isInDuelMode()) return 'not-active';

	const shouldLeave = window.confirm(getDuelExitMessage(targetMode));
	if (!shouldLeave) return false;

	if (isActiveDuelRound()) {
		abortDuelRound();
		showDuelLobby('Runda a fost oprită. Ați revenit în lobby-ul camerei.');
		return 'to-lobby';
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
	setGuessControlsVisible(false);
	const overlay = document.getElementById('difficulty-overlay');
	if (overlay) overlay.classList.add('hidden');
	gameModeController?.enterDuel?.({ roomId: activeRoomId });
	gameModeSelectionController?.updateModeSelection?.('duel');
	const lobbyState = lastDuelRoomState || {
		roomId: activeRoomId,
		roundState: 'waiting',
		players: [],
		spectators: [],
		scoreboard: []
	};
	renderDuelLobby({ ...lobbyState, roundState: 'waiting' }, { forceVisible: true });
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
	const leaveResult = confirmDuelExit('daily');
	if (leaveResult === false || leaveResult === 'to-lobby') return;
	dailyChallengeController.start(level);
}

function startRoundFromSelection(level, options = {}) {
	if (gameModeController?.isDuel?.() && options.source !== 'duel-lobby') {
		showErrorToast('În Duel, dificultatea și startul rundei se fac doar din lobby.');
		return;
	}

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
	lastDuelRoomState = null;
	clearRoomFromUrl();
	resetRoomUi();
	roleState.setSpectatorMode(false);
	timer.setHostStatus(true);
	setDuelRoundState('waiting');
	resetLiveBoard();
	resetOpponentProgress();
	resetDuelLobby();
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
	window.addEventListener('beforeunload', (event) => {
		if (!isActiveDuelRound()) return;
		event.preventDefault();
		event.returnValue = '';
	});

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
		renderOpponentProgress,
		resetOpponentProgress,
		renderDuelLobby,
		resetDuelLobby,
		updateDuelRoomState,
		hideGuessControlsAfterLocalFinish,
		showGuessControlsForActiveRound,
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
		showHostOnlyTimerMessage,
		getIsDuelMode: () => gameModeController?.isDuel?.() || false
	});
	dailyChallengeController.startCountdown();
	setupShareButton();
	setupAuth();
	socketController.connect();
	setupDuelLobbyView({
		timer,
		onStartRound: (level) => startRoundFromSelection(level, { source: 'duel-lobby' })
	});

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
