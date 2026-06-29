/** Leagă evenimentele Socket.IO primite de la server. */
export function registerSocketEvents(socket, app) {
	[
		'initGame',
		'roomUpdate',
		'guessResult',
		'gameRestarted',
		'gameTimedOut',
		'errorMessage',
		'roomFull',
		'hostStatus'
	].forEach(eventName => socket.off(eventName));

	socket.on('initGame', (data) => {
		const overlay = document.getElementById('difficulty-overlay');
		if (overlay) overlay.classList.add('hidden');

		app.setDriversList(data.drivers);
		app.setRoundFinished(false);
		app.exitRematchMode();

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
		if (statusEl) statusEl.innerText = "Ghicește pilotul misterios!";

		app.initializeGridStructure();

		const gameZone = document.getElementById("gameZone");
		if (gameZone) gameZone.classList.remove("game-zone-hidden");
	});

	socket.on('roomUpdate', (data) => {
		const badge = document.getElementById("duelStatus");
		if (badge) {
			const maxPlayers = data.maxPlayers || 2;
			const roleLabel = app.timer.isHost() ? ' · Host' : '';
			badge.innerText = `Online: ${data.playerCount}/${maxPlayers}${roleLabel}`;
		}
	});

	socket.on('hostStatus', (data) => {
		app.timer.setHostStatus(Boolean(data && data.isHost));

		const badge = document.getElementById("duelStatus");
		if (badge) {
			badge.innerText = badge.innerText.replace(/ · Host/g, '');
			if (app.timer.isHost()) {
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

		const popup = document.getElementById("endGameDisplay");
		if (popup) popup.className = "end-game-popup";

		const backdrop = document.getElementById("endGameBackdrop");
		if (backdrop) backdrop.classList.remove("show");

		const gz = document.getElementById("gameZone");
		const st = document.getElementById("status");
		if (gz) gz.classList.remove("game-zone-hidden");
		if (st) st.classList.remove("is-hidden");
		if (st) st.innerText = "Ghicește noul pilot misterios!";

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
