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
