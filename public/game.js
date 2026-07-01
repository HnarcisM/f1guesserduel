import { createAutocomplete } from './js/autocomplete.js';
import { initializeGridStructure, renderGuessResult } from './js/gridView.js';
import { createTimerView } from './js/timerView.js';
import { createAuthView } from './js/authView.js';
import { renderLiveBoard, resetLiveBoard } from './js/liveBoardView.js';
import { createRoleState } from './js/roleState.js';
import { createDailyChallengeController } from './js/dailyChallengeController.js';
import { createEndGameController } from './js/endGameController.js';
import { createGameSocketController } from './js/gameSocketController.js';
import { setupShareButton, setupRoom } from './js/roomController.js';
import { setupMenuControllers } from './js/menuController.js';
import { showErrorToast } from './js/toastController.js';

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
		getIsDailyMode: dailyChallengeController.isMode,
		getIsRoundFinished: () => isRoundFinished,
		setRoundFinished
	});
}

function sendGuess() {
	if (!roleState.requirePlayer('Ești spectator. Poți urmări jocul, dar nu poți trimite încercări.')) return;

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

	socketController?.emit(
		dailyChallengeController.isMode() ? 'submitDailyGuess' : 'submitGuess',
		finalDriver.id
	);
	inputEl.value = '';
	autocomplete.clearSuggestions();
	autocomplete.clearSelectedDriverId();
}

function startRoundFromSelection(level) {
	dailyChallengeController.setStartPending(false);
	dailyChallengeController.setMode(false);
	if (!roleState.requirePlayer('Ești spectator. Doar hostul poate porni jocul.')) return;

	const overlay = document.getElementById('difficulty-overlay');
	if (overlay) overlay.classList.add('hidden');

	if (!socketController?.emit('setDifficulty', timer.buildRoundOptions(level))) {
		showErrorToast("Butonul funcționează, dar nu ești conectat la server! Porneste 'node server.js'");
	}
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
		resetLiveBoard
	});

	createEndGameHandlers();
	socketController = createGameSocketController({
		setDriversList,
		setRoundFinished,
		roleState,
		dailyChallengeController,
		endGameController,
		initializeGridStructure,
		renderGuessResult,
		renderLiveBoard,
		resetLiveBoard,
		timer,
		autocomplete
	});
	setupMenuControllers({
		autocomplete,
		sendGuess,
		requestRematch: endGameController.requestRematch,
		hideEndGamePopup: endGameController.hideEndGamePopup,
		startRoundFromSelection,
		startDailyChallenge: dailyChallengeController.start,
		timer,
		showHostOnlyTimerMessage
	});
	dailyChallengeController.startCountdown();
	setupShareButton();
	setupAuth();
	socketController.connect();
	setupRoom({ getSocket: socketController.getSocket });
});
