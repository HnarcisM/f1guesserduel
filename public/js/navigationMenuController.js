import { showErrorToast } from './toastController.js';

export function setNavigationMenuOpen(menu, isOpen, { focusFirst = false, restoreFocus = false } = {}) {
	if (!menu) return;
	const menuButton = document.getElementById('menu-hamburger');
	menu.classList.toggle('hidden', !isOpen);
	menu.inert = !isOpen;
	menu.setAttribute?.('aria-hidden', String(!isOpen));
	menuButton?.setAttribute?.('aria-expanded', String(isOpen));
	menuButton?.setAttribute?.('aria-label', isOpen ? 'Închide meniul' : 'Deschide meniul');

	if (isOpen && focusFirst) {
		menu.querySelector?.('summary, button:not([disabled])')?.focus?.();
	} else if (!isOpen && restoreFocus) {
		menuButton?.focus?.();
	}
}

export function closeNavigationMenu(menu, options = {}) {
	setNavigationMenuOpen(menu, false, options);
}

export function setupDailyChallengeControls({ startDailyChallenge }) {
	document.addEventListener('click', (event) => {
		const dailyControl = event.target.closest('[data-daily-level]');
		if (!dailyControl || dailyControl.disabled) return;

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		const menu = document.getElementById('dropdown-menu');
		closeNavigationMenu(menu, { restoreFocus: true });

		startDailyChallenge(dailyControl.dataset.dailyLevel);
	}, true);
}

export function setupMenu({ startRoundFromSelection, startDailyChallenge, confirmDuelExit, abortDuelRound, getIsDuelMode }) {
	const menuBtn = document.getElementById('menu-hamburger');
	const menu = document.getElementById('dropdown-menu');

	if (menuBtn && menu) {
		menuBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			setNavigationMenuOpen(menu, menu.classList.contains('hidden'));
		});
		menuBtn.addEventListener('keydown', (event) => {
			if (event.key !== 'ArrowDown') return;
			event.preventDefault();
			setNavigationMenuOpen(menu, true, { focusFirst: true });
		});
		menu.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			event.stopPropagation();
			closeNavigationMenu(menu, { restoreFocus: true });
		});
		setNavigationMenuOpen(menu, false);
	}

	const siteTitle = document.querySelector('#siteHomeControl');
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
			closeNavigationMenu(menu, { restoreFocus: true });

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
			closeNavigationMenu(menu, { restoreFocus: true });
			if (level) startDailyChallenge(level);
		});
	});

	return menu;
}
