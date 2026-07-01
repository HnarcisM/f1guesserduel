import { registerSocketEvents } from './socketEvents.js';

/**
 * Gestionează conexiunea Socket.IO și maparea dependențelor jocului către
 * layer-ul de evenimente socket. Nu conține logică de UI specifică rundelor;
 * doar creează conexiunea și expune operații mici pentru restul aplicației.
 */
export function createGameSocketController({
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
}) {
	let socket = null;

	function getSocket() {
		return socket;
	}

	function buildEventHandlers() {
		return {
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
		};
	}

	function connect() {
		try {
			if (typeof io === 'undefined') {
				console.error("Eroare: Socket.io nu este încărcat! Pornește serverul cu 'node server.js' și accesează http://localhost:3000");
				return null;
			}

			if (socket) {
				socket.disconnect();
			}

			socket = io();
			registerSocketEvents(socket, buildEventHandlers());
			return socket;
		} catch (err) {
			console.error('Eroare conexiune server:', err);
			return null;
		}
	}

	function refreshAuthUser(socketAuthToken = null) {
		if (socket && socket.connected) {
			socket.emit('refreshAuthUser', { socketAuthToken: socketAuthToken || null });
		}
	}

	function emit(eventName, ...args) {
		if (!socket) return false;
		socket.emit(eventName, ...args);
		return true;
	}

	return {
		connect,
		getSocket,
		refreshAuthUser,
		emit
	};
}
