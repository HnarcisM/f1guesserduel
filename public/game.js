import { createAutocomplete } from './js/autocomplete.js';
import { initializeGridStructure, renderGuessResult } from './js/gridView.js';
import { createTimerView } from './js/timerView.js';
import { registerSocketEvents } from './js/socketEvents.js';
import { createAuthView } from './js/authView.js';
import { renderLiveBoard, resetLiveBoard } from './js/liveBoardView.js';
import { createRoleState } from './js/roleState.js';
import { createDailyChallengeState } from './js/dailyChallengeState.js';
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
let isDailyMode = false;
let isDailyStartPending = false;
let currentDailyChallenge = null;
let autocomplete;
let endGameController;

const dailyChallengeState = createDailyChallengeState({
	getCurrentUser: () => authView?.getCurrentUser?.() || null
});

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

function setDailyStartPending(value) {
	isDailyStartPending = Boolean(value);
}

function setDailyMode(value, challenge = null) {
	isDailyMode = Boolean(value);
	if (isDailyMode) isDailyStartPending = false;
	currentDailyChallenge = isDailyMode ? challenge : null;
	document.body.classList.toggle('daily-active', isDailyMode);

	if (isDailyMode) {
		roleState.setSpectatorMode(false);
		resetLiveBoard();
	}
}

function getDailyLevelLabel(level) {
	const labels = {
		easy: 'Easy',
		medium: 'Medium',
		hard: 'Hard'
	};
	return labels[level] || level;
}

function showDailyBlockedMessage(level) {
	const message = dailyChallengeState.getBlockedMessage(level);
	const status = document.getElementById('status');
	if (status) {
		status.classList.remove('is-hidden');
		status.textContent = message;
	}
	alert(message);
}

function completeDailyChallenge(data = {}) {
	if (!isDailyMode) return;
	dailyChallengeState.markCompleted({
		level: data.difficulty || currentDailyChallenge?.difficulty,
		challengeId: data.dailyChallengeId || currentDailyChallenge?.dailyChallengeId,
		dailyDate: data.dailyDate || currentDailyChallenge?.dailyDate
	});
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
		dailyChallengeState,
		getSocket: () => socket,
		getIsDailyMode: () => isDailyMode,
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
		socket.emit(isDailyMode ? 'submitDailyGuess' : 'submitGuess', finalDriver.id);
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
		setDailyMode,
		setDailyStartPending,
		completeDailyChallenge,
		isDailyMode: () => isDailyMode,
		isDailyStartPending: () => isDailyStartPending,
		isSpectator: roleState.isSpectator,
		getRoleBadgeLabel: roleState.getRoleBadgeLabel,
		exitRematchMode: endGameController.exitRematchMode,
		initializeGridStructure,
		renderGuessResult,
		showEndGamePopup: endGameController.showEndGamePopup,
		hideEndGamePopup: endGameController.hideEndGamePopup,
		renderLiveBoard,
		resetLiveBoard,
		timer,
		autocomplete
	});
}

function startDailyChallenge(level) {
	if (!level) return;
	if (!dailyChallengeState.canStart(level)) {
		showDailyBlockedMessage(level);
		return;
	}

	isDailyStartPending = true;
	setDailyMode(true, { difficulty: level });

	const overlay = document.getElementById('difficulty-overlay');
	if (overlay) overlay.classList.add('hidden');

	const status = document.getElementById('status');
	if (status) {
		status.classList.remove('is-hidden');
		status.textContent = `Se pornește Daily Challenge ${getDailyLevelLabel(level)}...`;
	}

	const badge = document.getElementById('duelStatus');
	if (badge) badge.innerText = 'Daily Challenge · Individual';

	if (socket) {
		socket.emit('startDailyChallenge', {
			level,
			dailyDate: dailyChallengeState.getTodayDateKey()
		});
	} else {
		isDailyStartPending = false;
		setDailyMode(false);
		alert("Butonul funcționează, dar nu ești conectat la server! Porneste 'node server.js'");
	}
}

function startRoundFromSelection(level) {
	isDailyStartPending = false;
	setDailyMode(false);
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
	dailyChallengeState.updateControls();

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

	createEndGameHandlers();
	setupDailyChallengeControls({ startDailyChallenge });
	const menu = setupMenu({ startRoundFromSelection, startDailyChallenge });
	setupThemeMenu(menu);
	dailyChallengeState.startCountdown();
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
		startDailyChallenge
	});
	setupGlobalDocumentEvents(menu, {
		autocomplete,
		hideEndGamePopup: endGameController.hideEndGamePopup,
		requestRematch: endGameController.requestRematch
	});
});
