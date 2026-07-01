import { showErrorToast } from './toastController.js';

export function setupTimerControls(menu, { timer, showHostOnlyTimerMessage, getIsDuelMode }) {
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
			if (getIsDuelMode?.()) {
				showErrorToast('În Duel, timerul se schimbă doar din lobby.');
				if (menu) menu.classList.add('hidden');
				return;
			}
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
