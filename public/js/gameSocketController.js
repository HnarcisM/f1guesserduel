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
	gameModeController,
	endGameController,
	initializeGridStructure,
	renderGuessResult,
	renderLiveBoard,
	renderRoomScoreboard,
	renderOpponentProgress,
	resetOpponentProgress,
	renderDuelLobby,
	renderDuelRoomList,
	resetDuelLobby,
	updateDuelRoomState,
	hideGuessControlsAfterLocalFinish,
	showGuessControlsForActiveRound,
	setDuelRoundState,
	showDuelLobby,
	resetLiveBoard,
	resetRoomScoreboard,
	timer,
	autocomplete,
	refreshAccountSummary
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
			enterDuelMode: gameModeController?.enterDuel,
			enterSingleMode: gameModeController?.enterSingle,
			enterDailyMode: gameModeController?.enterDaily,
			getGameMode: gameModeController?.getMode,
			completeDailyChallenge: dailyChallengeController.complete,
			isDailyMode: () => gameModeController?.isDaily?.() || dailyChallengeController.isMode(),
			isDuelMode: () => gameModeController?.isDuel?.() || false,
			isSingleMode: () => gameModeController?.isSingle?.() || false,
			isDailyStartPending: dailyChallengeController.isStartPending,
			isSpectator: roleState.isSpectator,
			getRoleBadgeLabel: roleState.getRoleBadgeLabel,
			exitRematchMode: endGameController.exitRematchMode,
			initializeGridStructure,
			renderGuessResult,
			showEndGamePopup: endGameController.showEndGamePopup,
			syncEndGameAccountStats: endGameController.syncAccountStats,
			showAccountReward: endGameController.showAccountReward,
			hideEndGamePopup: endGameController.hideEndGamePopup,
			renderLiveBoard,
			renderRoomScoreboard,
			renderOpponentProgress,
			resetOpponentProgress,
			renderDuelLobby,
			renderDuelRoomList,
			resetDuelLobby,
			updateDuelRoomState,
			hideGuessControlsAfterLocalFinish,
			showGuessControlsForActiveRound,
			setDuelRoundState,
			showDuelLobby,
			resetLiveBoard,
			resetRoomScoreboard,
			handleInitDailyChallenge: dailyChallengeController.handleInit,
			handleDailyChallengeError: dailyChallengeController.handleError,
			handleDailyChallengeStatus: dailyChallengeController.handleStatus,
			timer,
			autocomplete,
			refreshAccountSummary
		};
	}

	function connect() {
		try {
			if (typeof io === 'undefined') {
				console.error("Eroare: Socket.io nu este încărcat! Pornește serverul cu 'npm start' și accesează http://localhost:3000");
				return null;
			}

			if (socket) {
				socket.disconnect();
			}

			socket = io();
			registerSocketEvents(socket, buildEventHandlers());
			dailyChallengeController.requestStatus?.();
			return socket;
		} catch (err) {
			console.error('Eroare conexiune server:', err);
			return null;
		}
	}

	function refreshAuthUser(socketAuthToken = null, onRefreshed = null) {
		if (socket && socket.connected) {
			socket.emit('refreshAuthUser', { socketAuthToken: socketAuthToken || null }, () => {
				onRefreshed?.();
			});
			return;
		}
		onRefreshed?.();
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
