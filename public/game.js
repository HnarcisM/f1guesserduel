import { updateStats, renderStats } from './js/stats.js';
import { createAutocomplete } from './js/autocomplete.js';
import { initializeGridStructure, renderGuessResult } from './js/gridView.js';
import { createTimerView } from './js/timerView.js';
import { registerSocketEvents } from './js/socketEvents.js';
import { createAuthView } from './js/authView.js';

/**
 * F1 Guesser Duel - frontend entry point.
 *
 * După etapa 3.1, game.js orchestrează modulele UI principale:
 * - autocomplete pentru piloți;
 * - grid rendering;
 * - timer UI;
 * - Socket.IO events;
 * - bootstrap și event listeners.
 */

let socket;
let driversList = [];
let isRoundFinished = false;
let isRematchMode = false;
let authView;
let authReadyOnce = false;
let isSpectatorMode = false;

function setDriversList(drivers) {
	driversList = Array.isArray(drivers) ? drivers : [];
}

function setRoundFinished(value) {
	isRoundFinished = Boolean(value);
}

function setSpectatorMode(value) {
	isSpectatorMode = Boolean(value);
	const gameZone = document.getElementById("gameZone");
	const status = document.getElementById("status");
	const sendBtn = document.getElementById("sendGuessBtn");
	const inputEl = document.getElementById("driverInput");

	if (gameZone) {
		gameZone.classList.toggle("spectator-mode", isSpectatorMode);
		if (isSpectatorMode) gameZone.classList.add("game-zone-hidden");
	}

	if (sendBtn) {
		sendBtn.disabled = isSpectatorMode;
		sendBtn.title = isSpectatorMode ? "Spectatorii pot urmări jocul, dar nu pot trimite încercări." : "";
	}

	if (inputEl) {
		inputEl.disabled = isSpectatorMode;
		inputEl.placeholder = isSpectatorMode
			? "Mod spectator - urmărești duelul"
			: "Scrie prenume sau nume (ex: Ham...)";
	}

	if (status && isSpectatorMode) {
		status.classList.remove("is-hidden");
		status.textContent = "Ești spectator în această cameră. Primii 2 participanți sunt jucători activi.";
	}
}

function showHostOnlyTimerMessage() {
	const status = document.getElementById("status");
	if (status) {
		status.textContent = isSpectatorMode
			? "Ești spectator. Doar hostul poate modifica timerul."
			: "Doar hostul camerei poate modifica timerul.";
	}
}

const timer = createTimerView({
	getSocket: () => socket,
	isRoundFinished: () => isRoundFinished,
	onHostOnlyMessage: showHostOnlyTimerMessage
});

let autocomplete;

function setSubmitButtonMode(mode) {
	const sendBtn = document.getElementById("sendGuessBtn");
	if (!sendBtn) return;

	if (mode === "rematch") {
		sendBtn.textContent = "🔄 Rematch";
		sendBtn.classList.add("rematch-submit-btn");
		return;
	}

	sendBtn.textContent = "Trimite";
	sendBtn.classList.remove("rematch-submit-btn");
}

function enterRematchMode() {
	if (isSpectatorMode) return;
	isRematchMode = true;
	const gameZone = document.getElementById("gameZone");
	const status = document.getElementById("status");

	if (gameZone) {
		gameZone.classList.remove("game-zone-hidden");
		gameZone.classList.add("game-zone-rematch");
	}

	if (status) {
		status.classList.remove("is-hidden");
		status.textContent = "Runda s-a terminat. Apasă Rematch pentru un pilot nou.";
	}

	setSubmitButtonMode("rematch");
}

function exitRematchMode() {
	isRematchMode = false;
	const gameZone = document.getElementById("gameZone");
	if (gameZone) gameZone.classList.remove("game-zone-rematch");
	setSubmitButtonMode("submit");
}

function requestRematch() {
	if (isSpectatorMode) {
		const status = document.getElementById("status");
		if (status) {
			status.classList.remove("is-hidden");
			status.textContent = "Ești spectator. Doar hostul poate porni un rematch.";
		}
		return;
	}

	if (socket) socket.emit('restartGame', timer.buildRestartOptions());
}

function hideEndGamePopup(keepRematchAvailable = true) {
	const popup = document.getElementById("endGameDisplay");
	const backdrop = document.getElementById("endGameBackdrop");

	if (popup) popup.classList.remove("show");
	if (backdrop) backdrop.classList.remove("show");
	if (keepRematchAvailable && isRoundFinished) enterRematchMode();
}

function showEndGamePopup({ isCorrect, attempts, target, isTimedOut = false }) {
	if (isRoundFinished) return;
	isRoundFinished = true;
	isRematchMode = false;
	timer.stopRoundTimer();

	const gz = document.getElementById("gameZone");
	const st = document.getElementById("status");
	if (gz) gz.classList.add("game-zone-hidden");
	if (st) st.classList.add("is-hidden");

	const popup = document.getElementById("endGameDisplay");
	const backdrop = document.getElementById("endGameBackdrop");
	if (!popup) return;

	popup.classList.remove("win-style", "lose-style");

	if (isCorrect) {
		document.getElementById("endGameTitle").innerText = "🏆 AI CÂȘTIGAT!";
		document.getElementById("endGameMessage").innerHTML = `Ai descoperit pilotul misterios în <strong>${attempts}</strong> ${attempts === 1 ? 'încercare' : 'încercări'}!`;
		popup.classList.add("win-style");
		updateStats(true, attempts);
	} else if (isTimedOut) {
		document.getElementById("endGameTitle").innerText = "⏱️ TIMP EXPIRAT!";
		document.getElementById("endGameMessage").innerHTML = `Timpul s-a terminat. Pilotul misterios era: <strong>${target ? target.name : 'Necunoscut'}</strong>`;
		popup.classList.add("lose-style");
		updateStats(false, 0);
	} else {
		document.getElementById("endGameTitle").innerText = "💀 AI PIERDUT!";
		document.getElementById("endGameMessage").innerHTML = `Din păcate nu ai ghicit. Pilotul misterios era: <strong>${target ? target.name : 'Necunoscut'}</strong>`;
		popup.classList.add("lose-style");
		updateStats(false, 0);
	}

	renderStats();
	if (backdrop) backdrop.classList.add("show");
	popup.classList.add("show");
}

function sendGuess() {
	if (isSpectatorMode) {
		const status = document.getElementById("status");
		if (status) {
			status.classList.remove("is-hidden");
			status.textContent = "Ești spectator. Poți urmări jocul, dar nu poți trimite încercări.";
		}
		return;
	}

	if (isRematchMode) {
		requestRematch();
		return;
	}

	if (isRoundFinished) return;

	const inputEl = document.getElementById("driverInput");
	if (!inputEl) return;
	const inputVal = inputEl.value.trim();
	const selectedDriverId = autocomplete.getSelectedDriverId();
	const finalDriver = driversList.find(d => d.id === selectedDriverId || d.name.toLowerCase() === inputVal.toLowerCase());
	if (!finalDriver) {
		alert("Te rog selectează un pilot valid din lista de predicții!");
		return;
	}

	if (socket) {
		socket.emit('submitGuess', finalDriver.id);
	}
	inputEl.value = "";
	autocomplete.clearSuggestions();
	autocomplete.clearSelectedDriverId();
}

function setupSocketEvents() {
	registerSocketEvents(socket, {
		setDriversList,
		setRoundFinished,
		setSpectatorMode,
		isSpectator: () => isSpectatorMode,
		exitRematchMode,
		initializeGridStructure,
		renderGuessResult,
		showEndGamePopup,
		hideEndGamePopup,
		timer,
		autocomplete
	});
}

function fallbackCopyText(text, onCopied) {
	const textArea = document.createElement("textarea");
	textArea.value = text;
	textArea.classList.add("fallback-copy-textarea");
	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();
	try {
		document.execCommand('copy');
		onCopied();
	} catch (err) {
		console.error('Fallback eșuat completely:', err);
		alert("Nu s-a putut copia automat. Link-ul tău este: " + text);
	}
	document.body.removeChild(textArea);
}

function setupShareButton() {
	const shareBtn = document.getElementById("shareRoomBtn");
	if (!shareBtn) return;

	function triggerTooltip() {
		shareBtn.classList.add("copied");
		setTimeout(() => shareBtn.classList.remove("copied"), 2000);
	}

	shareBtn.addEventListener("click", () => {
		const currentUrl = window.location.href;

		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(currentUrl)
				.then(triggerTooltip)
				.catch(err => {
					console.error("Eroare la copiere nativă:", err);
					fallbackCopyText(currentUrl, triggerTooltip);
				});
		} else {
			fallbackCopyText(currentUrl, triggerTooltip);
		}
	});
}

function setupMenu() {
	const menuBtn = document.getElementById("menu-hamburger");
	const menu = document.getElementById("dropdown-menu");

	if (menuBtn && menu) {
		menuBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			menu.classList.toggle("hidden");
		});
	}

	const siteTitle = document.querySelector(".site-header h1");
	if (siteTitle) {
		siteTitle.addEventListener("click", () => window.location.reload());
	}

	document.querySelectorAll(".menu-item:not(.theme-item):not(.timer-item)").forEach(item => {
		item.addEventListener("click", function() {
			const choice = this.getAttribute("data-level");
			if (menu) menu.classList.add("hidden");

			if (choice === "home") {
				window.location.reload();
			} else if (choice) {
				if (isSpectatorMode) {
					const status = document.getElementById("status");
					if (status) {
						status.classList.remove("is-hidden");
						status.textContent = "Ești spectator. Doar hostul poate schimba dificultatea.";
					}
					return;
				}

				const overlay = document.getElementById('difficulty-overlay');
				if (overlay) overlay.classList.add('hidden');
				if (socket) socket.emit('setDifficulty', timer.buildRoundOptions(choice));
			}
		});
	});

	return menu;
}

function setupThemeMenu(menu) {
	const savedTheme = localStorage.getItem('f1-guesser-theme') || 'default';
	document.body.setAttribute('data-app-theme', savedTheme);

	document.querySelectorAll(".theme-item").forEach(item => {
		item.addEventListener("click", function(e) {
			e.stopPropagation();
			const selectedTheme = this.getAttribute("data-theme");
			document.body.setAttribute('data-app-theme', selectedTheme);
			localStorage.setItem('f1-guesser-theme', selectedTheme);
			if (menu) menu.classList.add("hidden");
		});
	});
}

function setupTimerControls(menu) {
	document.querySelectorAll("[data-timer-mode]").forEach(button => {
		button.addEventListener("click", function() {
			if (!timer.isHost()) {
				showHostOnlyTimerMessage();
				return;
			}
			const value = this.dataset.timerMode;
			timer.setTimedMode(value !== "off", value);
		});
	});

	document.querySelectorAll(".timer-item").forEach(item => {
		item.addEventListener("click", function(e) {
			e.stopPropagation();
			if (!timer.isHost()) {
				showHostOnlyTimerMessage();
				return;
			}
			const value = this.dataset.timer;
			timer.setTimedMode(value !== "off", value);
			if (menu) menu.classList.add("hidden");
		});
	});
	timer.syncTimerModeControls();
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
		console.error("Eroare conexiune server:", err);
	}
}

function getRoomIdFromUrl() {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get('room');
}

function setupRoom() {
	let roomId = getRoomIdFromUrl();

	if (!roomId) {
		roomId = Math.random().toString(36).substring(2, 9);
		window.history.pushState({}, '', `?room=${roomId}`);
	}

	const roomBtnTextEl = document.getElementById("roomBtnText");
	if (roomBtnTextEl) {
		roomBtnTextEl.textContent = `🏁 Room: ${roomId}`;
	}

	const linkTextEl = document.getElementById("linkText");
	if (linkTextEl) linkTextEl.innerText = window.location.href;

	if (socket) {
		socket.emit('joinRoom', roomId);
	}
}

function setupGameControls() {
	document.querySelectorAll(".btn-diff").forEach(button => {
		button.addEventListener("click", function() {
			const level = this.getAttribute("data-level");
			if (isSpectatorMode) {
				const status = document.getElementById("status");
				if (status) {
					status.classList.remove("is-hidden");
					status.textContent = "Ești spectator. Doar hostul poate porni jocul.";
				}
				return;
			}

			const overlay = document.getElementById('difficulty-overlay');
			if (overlay) overlay.classList.add('hidden');

			if (socket) {
				socket.emit('setDifficulty', timer.buildRoundOptions(level));
			} else {
				alert("Butonul funcționează, dar nu ești conectat la server! Porneste 'node server.js'");
			}
		});
	});

	const sendBtn = document.getElementById("sendGuessBtn");
	if (sendBtn) sendBtn.addEventListener("click", sendGuess);

	const restartBtn = document.getElementById("restartGameBtn");
	if (restartBtn) restartBtn.addEventListener("click", requestRematch);

	const driverInput = document.getElementById("driverInput");
	if (driverInput) {
		driverInput.addEventListener("input", function(e) {
			autocomplete.showPredictions(e.target.value);
		});
		driverInput.addEventListener("keydown", autocomplete.handleKeydown);
	}

	const closePopupBtn = document.getElementById("closeEndGamePopup");
	if (closePopupBtn) {
		closePopupBtn.addEventListener("click", () => hideEndGamePopup(true));
	}
}


function handleAuthChangeWithoutLeavingRoom() {
	if (!authReadyOnce) {
		authReadyOnce = true;
		return;
	}

	/*
	 * Nu reconectăm socket-ul după login/logout.
	 * Player-ul este legat de socket.id pe server, iar reconectarea în mijlocul
	 * unei runde scoate player-ul din cameră și poate șterge runda dacă era singur.
	 * Păstrăm socket-ul curent ca să poți continua jocul imediat după login.
	 */
}

function setupAuth() {
	authView = createAuthView({
		onAuthChanged: handleAuthChangeWithoutLeavingRoom
	});
	authView.setup();
}

function setupGlobalDocumentEvents(menu) {
	document.addEventListener("keydown", function(e) {
		const popup = document.getElementById("endGameDisplay");
		const isPopupOpen = popup && popup.classList.contains("show");

		if (isPopupOpen && e.key === "Escape") {
			e.preventDefault();
			hideEndGamePopup(true);
		}

		if (isPopupOpen && e.key === "Enter") {
			e.preventDefault();
			requestRematch();
		}
	});

	document.addEventListener("click", function(e) {
		if (e.target.id !== "driverInput") {
			autocomplete.clearSuggestions();
		}

		const shareBtn = document.getElementById("shareRoomBtn");
		if (menu && !menu.classList.contains("hidden") && e.target.id !== "menu-hamburger" && !(shareBtn && shareBtn.contains(e.target))) {
			menu.classList.add("hidden");
		}
	});
}

document.addEventListener("DOMContentLoaded", () => {
	autocomplete = createAutocomplete({
		getDriversList: () => driversList,
		onSubmitGuess: sendGuess
	});

	const menu = setupMenu();
	setupThemeMenu(menu);
	setupTimerControls(menu);
	setupShareButton();
	setupAuth();
	setupSocketConnection();
	setupRoom();
	setupGameControls();
	setupGlobalDocumentEvents(menu);
});
