import { createAutocomplete } from './js/autocomplete.js';
import { initializeGridStructure, renderGuessResult } from './js/gridView.js';
import { createTimerView } from './js/timerView.js';
import { registerSocketEvents } from './js/socketEvents.js';
import { createAuthView } from './js/authView.js';
import { renderLiveBoard, resetLiveBoard } from './js/liveBoardView.js';
import { createRoleState } from './js/roleState.js';
import { createDailyChallengeController } from './js/dailyChallengeController.js';
import { createEndGameController } from './js/endGameController.js';
import { setupShareButton, setupRoom } from './js/roomController.js';
import {
	setupDailyChallengeControls,
	setupGameControls,
	setupGlobalDocumentEvents,
	setupMenu,
	setupThemeMenu,
	setupTimerControls
} from './js/menuController.js';

/**
 * F1 Guesser Duel - frontend entry point.
 *
 * game.js orchestrează modulele UI principale și păstrează doar starea de aplicație
 * care este partajată între Socket.IO, daily challenge, autocomplete și controllere.
 */

let socket;
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
	getSocket: () => socket,
	isRoundFinished: () => isRoundFinished,
	onHostOnlyMessage: showHostOnlyTimerMessage
});

function createEndGameHandlers() {
	endGameController = createEndGameController({
		roleState,
		timer,
		dailyChallengeState: dailyChallengeController.state,
		getSocket: () => socket,
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
		alert('Te rog selectează un pilot valid din lista de predicții!');
		return;
	}

	if (socket) {
		socket.emit(dailyChallengeController.isMode() ? 'submitDailyGuess' : 'submitGuess', finalDriver.id);
	}
	inputEl.value = '';
	autocomplete.clearSuggestions();
	autocomplete.clearSelectedDriverId();
}

function setupSocketEvents() {
	registerSocketEvents(socket, {
		setDriversList,
		setRoundFinished,
		setSpectatorMode: roleState.setSpectatorMode,
		setDailyMode: dailyChallengeController.setMode,
		setDailyStartPending: dailyChallengeController.setStartPending,
		completeDailyChallenge: dailyChallengeController.complete,
		isDailyMode: dailyChallengeController.isMode,
		isDailyStartPending: dailyChallengeController.isStartPending,
		isSpectator: roleState.isSpectator,
		getRoleBadgeLabel: roleState.getRoleBadgeLabel,
		exitRematchMode: endGameController.exitRematchMode,
		initializeGridStructure,
		renderGuessResult,
		showEndGamePopup: endGameController.showEndGamePopup,
		hideEndGamePopup: endGameController.hideEndGamePopup,
		renderLiveBoard,
		resetLiveBoard,
		handleInitDailyChallenge: dailyChallengeController.handleInit,
		handleDailyChallengeError: dailyChallengeController.handleError,
		timer,
		autocomplete
	});
}

function startRoundFromSelection(level) {
	dailyChallengeController.setStartPending(false);
	dailyChallengeController.setMode(false);
	if (!roleState.requirePlayer('Ești spectator. Doar hostul poate porni jocul.')) return;

	const overlay = document.getElementById('difficulty-overlay');
	if (overlay) overlay.classList.add('hidden');

	if (socket) {
		socket.emit('setDifficulty', timer.buildRoundOptions(level));
	} else {
		alert("Butonul funcționează, dar nu ești conectat la server! Porneste 'node server.js'");
	}
}

function setupSocketConnection() {
	try {
		if (typeof io !== 'undefined') {
			if (socket) {
				socket.disconnect();
			}
			socket = io();
			setupSocketEvents();
		} else {
			console.error("Eroare: Socket.io nu este încărcat! Pornește serverul cu 'node server.js' și accesează http://localhost:3000");
		}
	} catch (err) {
		console.error('Eroare conexiune server:', err);
	}
}

function handleAuthChangeWithoutLeavingRoom(currentUser) {
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

	if (socket && socket.connected) {
		socket.emit('refreshAuthUser', currentUser || null);
	}
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
		getSocket: () => socket,
		roleState,
		timer,
		setDriversList,
		setRoundFinished,
		exitRematchMode: () => endGameController?.exitRematchMode?.(),
		initializeGridStructure,
		resetLiveBoard
	});

	createEndGameHandlers();
	setupDailyChallengeControls({ startDailyChallenge: dailyChallengeController.start });
	const menu = setupMenu({ startRoundFromSelection, startDailyChallenge: dailyChallengeController.start });
	setupThemeMenu(menu);
	dailyChallengeController.startCountdown();
	setupTimerControls(menu, { timer, showHostOnlyTimerMessage });
	setupShareButton();
	setupAuth();
	setupSocketConnection();
	setupRoom({ getSocket: () => socket });
	setupGameControls({
		autocomplete,
		sendGuess,
		requestRematch: endGameController.requestRematch,
		hideEndGamePopup: endGameController.hideEndGamePopup,
		startRoundFromSelection,
		startDailyChallenge: dailyChallengeController.start
	});
	setupGlobalDocumentEvents(menu, {
		autocomplete,
		hideEndGamePopup: endGameController.hideEndGamePopup,
		requestRematch: endGameController.requestRematch
	});
});
