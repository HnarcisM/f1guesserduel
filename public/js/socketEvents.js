import { showErrorToast } from './toastController.js';

/** Leagă evenimentele Socket.IO primite de la server. */
export function registerSocketEvents(socket, app) {
	[
		'initGame',
		'roomStateUpdate',
		'guessResult',
		'gameRestarted',
		'gameTimedOut',
		'roundResolved',
		'duelAborted',
		'errorMessage',
		'roomFull',
		'hostStatus',
		'initDailyChallenge',
		'dailyGuessResult',
		'dailyChallengeError'
	].forEach(eventName => socket.off(eventName));

	function renderLiveBoardForSpectator(board, options = {}) {
		if (!app.isSpectator?.()) {
			app.resetLiveBoard?.();
			return;
		}

		app.renderLiveBoard?.(board, {
			...options,
			forceVisible: true
		});
	}

	function renderRoomScoreboard(roomState = {}) {
		if (!app.isDuelMode?.()) {
			app.resetRoomScoreboard?.();
			return;
		}

		app.renderRoomScoreboard?.(roomState.scoreboard || [], { forceVisible: true });
	}

	function updateRoomBadge(roomState = {}) {
		const badge = document.getElementById("duelStatus");
		if (!badge) return;

		const maxPlayers = roomState.maxPlayers || 2;
		const playerCount = roomState.playerCount || 0;
		const spectatorCount = roomState.spectatorCount || 0;
		const roleLabel = app.getRoleBadgeLabel?.(app.timer.isHost()) || '';
		const spectatorLabel = spectatorCount > 0 ? ` · Spectatori: ${spectatorCount}` : '';
		badge.innerText = `Jucători: ${playerCount}/${maxPlayers}${spectatorLabel}${roleLabel}`;
	}

	function handleRoomStateUpdate(payload = {}) {
		if (app.isDailyMode?.() || app.isDailyStartPending?.() || !app.isDuelMode?.()) return;

		const roomState = payload.room || payload;
		updateRoomBadge(roomState);
		renderRoomScoreboard(roomState);
		app.updateDuelRoomState?.(roomState);
		app.setDuelRoundState?.(roomState.roundState);
		if (roomState.roundState === 'playing') {
			app.resetDuelLobby?.();
		} else {
			app.renderDuelLobby?.(roomState, { forceVisible: true });
		}

		if (!app.isSpectator?.()) {
			if (roomState.roundState === 'playing' && roomState.you?.finished) {
				app.hideGuessControlsAfterLocalFinish?.();
			} else if (roomState.roundState === 'playing') {
				app.showGuessControlsForActiveRound?.();
			}
			app.renderOpponentProgress?.(roomState);
		}
		renderLiveBoardForSpectator(payload.liveBoard || roomState.liveBoard);
	}

	function buildRoundResolvedPopup(payload = {}) {
		const result = payload.resultForYou || {};
		if (result.outcome === 'pending') return null;

		const winnerName = payload.winnerUsername || 'Nimeni';
		const targetName = payload.target?.name || 'Necunoscut';
		const attempts = result.attempts || 0;

		if (result.outcome === 'win') {
			return {
				isCorrect: true,
				attempts,
				target: payload.target,
				customTitle: '🏁 AI CÂȘTIGAT RUNDA!',
				customMessage: `Ai câștigat runda în ${attempts} ${attempts === 1 ? 'încercare' : 'încercări'}. Pilotul era ${targetName}.`,
			force: true
			};
		}

		if (result.outcome === 'draw') {
			return {
				isCorrect: false,
				attempts,
				target: payload.target,
				customTitle: '🤝 REMIZĂ!',
				customMessage: `Runda s-a terminat la egalitate. Pilotul misterios era ${targetName}.`,
				statsResult: 'loss',
				force: true
			};
		}

		return {
			isCorrect: false,
			attempts,
			target: payload.target,
			customTitle: '💀 AI PIERDUT RUNDA!',
			customMessage: `${winnerName} a câștigat runda. Pilotul misterios era ${targetName}.`,
			statsResult: 'loss',
			force: true
		};
	}

	function handleRoundResolved(payload = {}) {
		if (!app.isDuelMode?.()) return;
		app.setDuelRoundState?.('finished');
		app.hideGuessControlsAfterLocalFinish?.();
		if (payload.scoreboard) app.renderRoomScoreboard?.(payload.scoreboard, { forceVisible: true });
		app.resetOpponentProgress?.();
		if (payload.liveBoard) app.renderLiveBoard?.(payload.liveBoard, { forceVisible: Boolean(app.isSpectator?.()) });

		if (app.isSpectator?.()) return;

		const popupPayload = buildRoundResolvedPopup(payload);
		if (popupPayload) {
			app.showEndGamePopup?.(popupPayload);
			return;
		}

		const statusEl = document.getElementById('status');
		if (statusEl && payload.winnerUsername) {
			statusEl.classList.remove('is-hidden');
			statusEl.textContent = `${payload.winnerUsername} a ghicit primul. Continuă runda până ghicești, rămâi fără încercări sau expiră timpul.`;
		}
	}



	function restorePlayerProgress(playerProgress = null) {
		if (!playerProgress || !Array.isArray(playerProgress.guesses)) return;

		for (const entry of playerProgress.guesses) {
			if (!entry || !entry.guess || !entry.results || typeof entry.attempt !== 'number') continue;
			app.renderGuessResult?.({
				guess: entry.guess,
				results: entry.results,
				attempts: entry.attempt
			});
		}

		if (playerProgress.finished) {
			app.setRoundFinished?.(true);
			app.hideGuessControlsAfterLocalFinish?.();
			const statusEl = document.getElementById('status');
			if (statusEl && app.isDuelMode?.()) {
				statusEl.classList.remove('is-hidden');
				statusEl.textContent = 'Ai revenit în rundă. Ai terminat deja încercările și aștepți rezultatul final.';
			}
		}
	}

	socket.on('initDailyChallenge', (data) => {
		app.handleInitDailyChallenge?.(data);
	});

	socket.on('initGame', (data) => {
		if (app.isDailyMode?.() || app.isDailyStartPending?.()) return;

		const overlay = document.getElementById('difficulty-overlay');
		if (overlay) overlay.classList.add('hidden');
		app.resetDuelLobby?.();

		app.setDailyMode?.(false);
		if (data.isSinglePlay) app.enterSingleMode?.();
		else if (!data.isDailyChallenge) app.enterDuelMode?.();
		app.setDriversList(data.drivers);
		app.setRoundFinished(false);
		app.resetOpponentProgress?.();
		app.resetDuelLobby?.();
		app.setDuelRoundState?.('playing');
		app.showGuessControlsForActiveRound?.();
		app.exitRematchMode();

		if (app.isSpectator?.()) {
			const statusEl = document.getElementById("status");
			if (statusEl) {
				statusEl.classList.remove("is-hidden");
				statusEl.innerText = "Mod spectator: urmărești duelul, dar nu poți trimite încercări.";
			}
		}

		if (data.timed) {
			app.timer.startRoundTimer(data.timeLimitSeconds, data.roundStartedAt);
		} else {
			app.timer.hideRoundTimer();
		}

		const diffLabel = document.getElementById("diff-display-label");
		if (diffLabel) {
			const dailyPrefix = data.isDailyChallenge ? 'Daily Challenge · ' : data.isSinglePlay ? 'Single Play · ' : '';
			const dailyDate = data.isDailyChallenge && data.dailyDate ? ` · ${data.dailyDate}` : '';
			diffLabel.innerText = `${dailyPrefix}Mod: ${data.difficulty}${dailyDate}`;
			diffLabel.className = `diff-display-label difficulty-${data.difficulty}${data.isDailyChallenge ? ' daily-mode' : ''}`;
		}

		const statusEl = document.getElementById("status");
		if (statusEl && !app.isSpectator?.()) {
			statusEl.innerText = data.isDailyChallenge
				? "Daily Challenge: ghicește pilotul zilei!"
				: data.isSinglePlay
					? "Single Play: ghicește pilotul misterios!"
					: "Ghicește pilotul misterios!";
		}

		app.initializeGridStructure();
		app.resetOpponentProgress?.();
		restorePlayerProgress(data.playerProgress);
		if (!app.isDuelMode?.()) app.resetRoomScoreboard?.();
		renderLiveBoardForSpectator(data.liveBoard);

	});

	socket.on('roomStateUpdate', handleRoomStateUpdate);

	socket.on('hostStatus', (data) => {
		if (app.isDailyMode?.() || app.isDailyStartPending?.() || !app.isDuelMode?.()) return;

		const wasSpectator = Boolean(app.isSpectator?.());
		const isSpectator = Boolean(data && data.isSpectator);
		app.setSpectatorMode?.(isSpectator);
		app.timer.setHostStatus(Boolean(data && data.isHost));

		if (!isSpectator && wasSpectator) {
			app.resetLiveBoard?.();
		}

		const badge = document.getElementById("duelStatus");
		if (badge) {
			badge.innerText = badge.innerText.replace(/ · Host| · Spectator/g, '');
			const roleLabel = app.getRoleBadgeLabel?.(app.timer.isHost()) || '';
			if (roleLabel) badge.innerText = `${badge.innerText}${roleLabel}`;
		}
	});


	socket.on('duelAborted', (payload = {}) => {
		if (!app.isDuelMode?.()) return;
		app.setDuelRoundState?.('waiting');
		if (payload.room) app.updateDuelRoomState?.({ ...payload.room, roundState: 'waiting' });
		app.resetOpponentProgress?.();
		if (payload.room) {
			updateRoomBadge(payload.room);
			renderRoomScoreboard(payload.room);
			app.renderDuelLobby?.(payload.room, { forceVisible: true });
		}
		app.resetLiveBoard?.();
		app.showDuelLobby?.(payload.message || 'Runda a fost oprită. Revenim în lobby.');
	});

	socket.on('roomFull', (data = {}) => {
		showErrorToast(`Camera este plină. Maxim ${data.maxPlayers || 2} jucători pot intra într-un duel.`);
	});

	socket.on('errorMessage', (message) => {
		if (message) showErrorToast(message);
	});

	socket.on('guessResult', (data) => {
		const { guess, results, attempts, isCorrect, isGameOver, target, roundResult } = data;
		const rendered = app.renderGuessResult({ guess, results, attempts });

		if (isGameOver && app.isDuelMode?.()) {
			// În Duel, popup-ul de rezultat apare doar când runda este complet
			// terminată pentru toți jucătorii și serverul trimite roundResolved.
			// Astfel evităm să anunțăm câștigătorul înainte ca al doilea player
			// să termine și înainte să se aplice regula attempts -> timp -> remiză.
			app.setRoundFinished?.(true);
			app.hideGuessControlsAfterLocalFinish?.();
			const statusEl = document.getElementById('status');
			if (statusEl) {
				statusEl.classList.remove('is-hidden');
				statusEl.textContent = 'Ai terminat runda. Așteaptă să termine și celălalt jucător pentru rezultatul final.';
			}
			return;
		}

		if (isGameOver) {
			app.showEndGamePopup({ isCorrect, attempts, target, force: true });
			return;
		}

		if (!rendered) return;
	});



	socket.on('dailyGuessResult', (data) => {
		const { guess, results, attempts, isCorrect, isGameOver, target } = data;
		const rendered = app.renderGuessResult({ guess, results, attempts });
		if (!rendered) return;

		if (isGameOver) {
			app.completeDailyChallenge?.(data);
			app.showEndGamePopup({
				isCorrect,
				attempts,
				target,
				isDailyChallenge: true
			});
		}
	});

	socket.on('dailyChallengeError', (message) => {
		app.handleDailyChallengeError?.(message);
	});
	socket.on('gameTimedOut', (data) => {
		if (data.roundResult) {
			const popupPayload = buildRoundResolvedPopup(data.roundResult);
			if (popupPayload) app.showEndGamePopup?.(popupPayload);
			return;
		}

		if (app.isDuelMode?.()) {
			app.setRoundFinished?.(true);
			app.hideGuessControlsAfterLocalFinish?.();
			const statusEl = document.getElementById('status');
			if (statusEl) {
				statusEl.classList.remove('is-hidden');
				statusEl.textContent = 'Timpul tău a expirat. Așteaptă să termine și celălalt jucător pentru rezultatul final.';
			}
			return;
		}

		app.showEndGamePopup({
			isCorrect: false,
			attempts: data.attempts || 0,
			target: data.target,
			isTimedOut: true
		});
	});

	socket.on('roundResolved', handleRoundResolved);

	socket.on('gameRestarted', (data = {}) => {
		app.setDailyMode?.(false);
		if (data.isSinglePlay) app.enterSingleMode?.();
		app.setRoundFinished(false);
		app.resetOpponentProgress?.();
		app.resetDuelLobby?.();
		app.setDuelRoundState?.('playing');
		app.showGuessControlsForActiveRound?.();
		app.exitRematchMode();
		app.initializeGridStructure();
		app.hideEndGamePopup(false);
		if (!app.isDuelMode?.()) app.resetRoomScoreboard?.();
		renderLiveBoardForSpectator(data.liveBoard);

		const popup = document.getElementById("endGameDisplay");
		if (popup) popup.className = "end-game-popup";

		const backdrop = document.getElementById("endGameBackdrop");
		if (backdrop) backdrop.classList.remove("show");

		const st = document.getElementById("status");
		if (st) st.classList.remove("is-hidden");
		if (st) {
			const playerMessage = data.isDailyChallenge
				? "Daily Challenge: ghicește din nou pilotul zilei."
				: data.isSinglePlay
					? "Single Play: ghicește noul pilot misterios!"
					: "Ghicește noul pilot misterios!";
			st.innerText = app.isSpectator?.()
				? "Mod spectator: urmărești noua rundă."
				: playerMessage;
		}

		if (data.timed) {
			app.timer.startRoundTimer(data.timeLimitSeconds, data.roundStartedAt);
		} else {
			app.timer.hideRoundTimer();
		}

		const inputEl = document.getElementById("driverInput");
		if (inputEl) inputEl.value = "";

		app.autocomplete.resetSelection();
	});
}
