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
