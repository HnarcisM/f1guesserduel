/** Leagă evenimentele Socket.IO primite de la server. */
export function registerSocketEvents(socket, app) {
	[
		'initGame',
		'roomStateUpdate',
		'roomUpdate',
		'guessResult',
		'gameRestarted',
		'gameTimedOut',
		'errorMessage',
		'roomFull',
		'hostStatus'
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

	function updateRoomBadge(roomState = {}) {
		const badge = document.getElementById("duelStatus");
		if (!badge) return;

		const maxPlayers = roomState.maxPlayers || 2;
		const playerCount = roomState.playerCount || 0;
		const spectatorCount = roomState.spectatorCount || 0;
		const roleLabel = app.isSpectator?.() ? ' · Spectator' : (app.timer.isHost() ? ' · Host' : '');
		const spectatorLabel = spectatorCount > 0 ? ` · Spectatori: ${spectatorCount}` : '';
		badge.innerText = `Jucători: ${playerCount}/${maxPlayers}${spectatorLabel}${roleLabel}`;
	}

	function handleRoomStateUpdate(payload = {}) {
		const roomState = payload.room || payload;
		updateRoomBadge(roomState);
		renderLiveBoardForSpectator(payload.liveBoard || roomState.liveBoard);
	}

	socket.on('initGame', (data) => {
		const overlay = document.getElementById('difficulty-overlay');
		if (overlay) overlay.classList.add('hidden');

		app.setDriversList(data.drivers);
		app.setRoundFinished(false);
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
			diffLabel.innerText = `Mod: ${data.difficulty}`;
			diffLabel.className = `diff-display-label difficulty-${data.difficulty}`;
		}

		const statusEl = document.getElementById("status");
		if (statusEl && !app.isSpectator?.()) statusEl.innerText = "Ghicește pilotul misterios!";

		app.initializeGridStructure();
		renderLiveBoardForSpectator(data.liveBoard);

		const gameZone = document.getElementById("gameZone");
		if (gameZone) {
			gameZone.classList.toggle("game-zone-hidden", Boolean(app.isSpectator?.()));
		}
	});

	socket.on('roomStateUpdate', handleRoomStateUpdate);

	// Compatibilitate defensivă pentru versiuni mai vechi de server/arhive intermediare.
	socket.on('roomUpdate', handleRoomStateUpdate);

	socket.on('hostStatus', (data) => {
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
			if (app.isSpectator?.()) {
				badge.innerText = `${badge.innerText} · Spectator`;
			} else if (app.timer.isHost()) {
				badge.innerText = `${badge.innerText} · Host`;
			}
		}
	});

	socket.on('roomFull', (data = {}) => {
		alert(`Camera este plină. Maxim ${data.maxPlayers || 2} jucători pot intra într-un duel.`);
	});

	socket.on('errorMessage', (message) => {
		if (message) alert(message);
	});

	socket.on('guessResult', (data) => {
		const { guess, results, attempts, isCorrect, isGameOver, target } = data;
		const rendered = app.renderGuessResult({ guess, results, attempts });
		if (!rendered) return;

		if (isGameOver) {
			app.showEndGamePopup({ isCorrect, attempts, target });
		}
	});

	socket.on('gameTimedOut', (data) => {
		app.showEndGamePopup({
			isCorrect: false,
			attempts: data.attempts || 0,
			target: data.target,
			isTimedOut: true
		});
	});

	socket.on('gameRestarted', (data = {}) => {
		app.setRoundFinished(false);
		app.exitRematchMode();
		app.initializeGridStructure();
		app.hideEndGamePopup(false);
		renderLiveBoardForSpectator(data.liveBoard);

		const popup = document.getElementById("endGameDisplay");
		if (popup) popup.className = "end-game-popup";

		const backdrop = document.getElementById("endGameBackdrop");
		if (backdrop) backdrop.classList.remove("show");

		const gz = document.getElementById("gameZone");
		const st = document.getElementById("status");
		if (gz) gz.classList.toggle("game-zone-hidden", Boolean(app.isSpectator?.()));
		if (st) st.classList.remove("is-hidden");
		if (st) {
			st.innerText = app.isSpectator?.()
				? "Mod spectator: urmărești noua rundă."
				: "Ghicește noul pilot misterios!";
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
