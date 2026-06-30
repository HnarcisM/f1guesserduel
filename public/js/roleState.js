/**
 * Păstrează și aplică rolul local al clientului în cameră.
 * Rolurile controlate aici sunt strict UI-side: player, spectator și host badge.
 */
export function createRoleState({ onSpectatorModeChanged } = {}) {
	let isSpectatorMode = false;

	const DEFAULT_INPUT_PLACEHOLDER = "Scrie prenume sau nume (ex: Ham...)";
	const SPECTATOR_INPUT_PLACEHOLDER = "Mod spectator - urmărești duelul";
	const SPECTATOR_STATUS_MESSAGE = "Ești spectator în această cameră. Urmărești încercările celor 2 jucători în board-ul de duel.";

	function setStatusMessage(message) {
		const status = document.getElementById("status");
		if (!status) return;
		status.classList.remove("is-hidden");
		status.textContent = message;
	}

	function applySpectatorUi() {
		document.body.classList.toggle('spectator-active', isSpectatorMode);

		const gameZone = document.getElementById("gameZone");
		const sendBtn = document.getElementById("sendGuessBtn");
		const inputEl = document.getElementById("driverInput");

		if (gameZone) {
			gameZone.classList.toggle("spectator-mode", isSpectatorMode);
			if (isSpectatorMode) {
				gameZone.classList.add("game-zone-hidden");
			}
		}

		if (sendBtn) {
			sendBtn.disabled = isSpectatorMode;
			sendBtn.title = isSpectatorMode
				? "Spectatorii pot urmări jocul, dar nu pot trimite încercări."
				: "";
		}

		if (inputEl) {
			inputEl.disabled = isSpectatorMode;
			inputEl.placeholder = isSpectatorMode
				? SPECTATOR_INPUT_PLACEHOLDER
				: DEFAULT_INPUT_PLACEHOLDER;
		}

		if (isSpectatorMode) {
			setStatusMessage(SPECTATOR_STATUS_MESSAGE);
		}
	}

	function setSpectatorMode(value) {
		const nextValue = Boolean(value);
		const changed = nextValue !== isSpectatorMode;
		isSpectatorMode = nextValue;

		applySpectatorUi();

		if (changed && typeof onSpectatorModeChanged === 'function') {
			onSpectatorModeChanged(isSpectatorMode);
		}
	}

	function isSpectator() {
		return isSpectatorMode;
	}

	function requirePlayer(message) {
		if (!isSpectatorMode) return true;
		setStatusMessage(message || "Ești spectator. Poți urmări jocul, dar nu poți interacționa cu runda.");
		return false;
	}

	function getRoleBadgeLabel(isHost) {
		if (isSpectatorMode) return ' · Spectator';
		return isHost ? ' · Host' : '';
	}

	return {
		setSpectatorMode,
		isSpectator,
		requirePlayer,
		setStatusMessage,
		getRoleBadgeLabel,
		applySpectatorUi
	};
}
