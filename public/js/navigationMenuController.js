import { showErrorToast } from './toastController.js';
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

export function setupMenu({ startRoundFromSelection, startDailyChallenge, confirmDuelExit, abortDuelRound, getIsDuelMode }) {
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
		siteTitle.addEventListener('click', () => {
			const leaveResult = confirmDuelExit?.('home');
			if (leaveResult === false) return;
			if (leaveResult === 'left-duel' || leaveResult === 'to-lobby') return;
			window.location.reload();
		});
	}

	document.querySelectorAll('.menu-item:not(.theme-item):not(.timer-item):not(.daily-item)').forEach(item => {
		item.addEventListener('click', function() {
			const choice = this.getAttribute('data-level');
			if (menu) menu.classList.add('hidden');

			if (choice === 'home') {
				const leaveResult = confirmDuelExit?.('home');
				if (leaveResult === false) return;
				if (leaveResult === 'left-duel' || leaveResult === 'to-lobby') return;
				window.location.reload();
			} else if (choice) {
				if (getIsDuelMode?.()) {
					showErrorToast('În Duel, dificultatea se schimbă doar din lobby.');
					return;
				}
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
