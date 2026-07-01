export function setupDailyChallengeControls({ startDailyChallenge }) {
	document.addEventListener('click', (event) => {
		const dailyControl = event.target.closest('[data-daily-level]');
		if (!dailyControl || dailyControl.disabled) return;

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		const menu = document.getElementById('dropdown-menu');
		if (menu) menu.classList.add('hidden');

		startDailyChallenge(dailyControl.dataset.dailyLevel);
	}, true);
}

export function setupMenu({ startRoundFromSelection, startDailyChallenge }) {
	const menuBtn = document.getElementById('menu-hamburger');
	const menu = document.getElementById('dropdown-menu');

	if (menuBtn && menu) {
		menuBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			menu.classList.toggle('hidden');
		});
	}

	const siteTitle = document.querySelector('.site-header h1');
	if (siteTitle) {
		siteTitle.addEventListener('click', () => window.location.reload());
	}

	document.querySelectorAll('.menu-item:not(.theme-item):not(.timer-item):not(.daily-item)').forEach(item => {
		item.addEventListener('click', function() {
			const choice = this.getAttribute('data-level');
			if (menu) menu.classList.add('hidden');

			if (choice === 'home') {
				window.location.reload();
			} else if (choice) {
				startRoundFromSelection(choice);
			}
		});
	});

	document.querySelectorAll('.daily-item').forEach(item => {
		item.addEventListener('click', function() {
			const level = this.getAttribute('data-daily-level');
			if (menu) menu.classList.add('hidden');
			if (level) startDailyChallenge(level);
		});
	});

	return menu;
}

export function setupThemeMenu(menu) {
	const savedTheme = localStorage.getItem('f1-guesser-theme') || 'default';
	document.body.setAttribute('data-app-theme', savedTheme);

	document.querySelectorAll('.theme-item').forEach(item => {
		item.addEventListener('click', function(e) {
			e.stopPropagation();
			const selectedTheme = this.getAttribute('data-theme');
			document.body.setAttribute('data-app-theme', selectedTheme);
			localStorage.setItem('f1-guesser-theme', selectedTheme);
			if (menu) menu.classList.add('hidden');
		});
	});
}

export function setupTimerControls(menu, { timer, showHostOnlyTimerMessage }) {
	document.querySelectorAll('[data-timer-mode]').forEach(button => {
		button.addEventListener('click', function() {
			if (!timer.isHost()) {
				showHostOnlyTimerMessage();
				return;
			}
			const value = this.dataset.timerMode;
			timer.setTimedMode(value !== 'off', value);
		});
	});

	document.querySelectorAll('.timer-item').forEach(item => {
		item.addEventListener('click', function(e) {
			e.stopPropagation();
			if (!timer.isHost()) {
				showHostOnlyTimerMessage();
				return;
			}
			const value = this.dataset.timer;
			timer.setTimedMode(value !== 'off', value);
			if (menu) menu.classList.add('hidden');
		});
	});
	timer.syncTimerModeControls();
}

export function setupGameControls({
	autocomplete,
	sendGuess,
	requestRematch,
	hideEndGamePopup,
	startRoundFromSelection,
	startDailyChallenge
}) {
	document.querySelectorAll('.btn-diff').forEach(button => {
		button.addEventListener('click', function() {
			const level = this.getAttribute('data-level');
			startRoundFromSelection(level);
		});
	});

	document.querySelectorAll('.daily-challenge-btn').forEach(button => {
		button.addEventListener('click', function(e) {
			e.preventDefault();
			e.stopPropagation();
			const level = this.getAttribute('data-daily-level');
			startDailyChallenge(level);
		});
	});

	const sendBtn = document.getElementById('sendGuessBtn');
	if (sendBtn) sendBtn.addEventListener('click', sendGuess);

	const restartBtn = document.getElementById('restartGameBtn');
	if (restartBtn) restartBtn.addEventListener('click', requestRematch);

	const driverInput = document.getElementById('driverInput');
	if (driverInput) {
		driverInput.addEventListener('input', function(e) {
			autocomplete.showPredictions(e.target.value);
		});
		driverInput.addEventListener('keydown', autocomplete.handleKeydown);
	}

	const closePopupBtn = document.getElementById('closeEndGamePopup');
	if (closePopupBtn) {
		closePopupBtn.addEventListener('click', () => hideEndGamePopup(true));
	}
}

export function setupGlobalDocumentEvents(menu, { autocomplete, hideEndGamePopup, requestRematch }) {
	document.addEventListener('keydown', function(e) {
		const popup = document.getElementById('endGameDisplay');
		const isPopupOpen = popup && popup.classList.contains('show');

		if (isPopupOpen && e.key === 'Escape') {
			e.preventDefault();
			hideEndGamePopup(true);
		}

		if (isPopupOpen && e.key === 'Enter') {
			e.preventDefault();
			requestRematch();
		}
	});

	document.addEventListener('click', function(e) {
		if (e.target.id !== 'driverInput') {
			autocomplete.clearSuggestions();
		}

		const shareBtn = document.getElementById('shareRoomBtn');
		if (menu && !menu.classList.contains('hidden') && e.target.id !== 'menu-hamburger' && !(shareBtn && shareBtn.contains(e.target))) {
			menu.classList.add('hidden');
		}
	});
}
