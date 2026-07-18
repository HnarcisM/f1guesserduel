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
		const clickedInsideMenu = Boolean(menu?.contains?.(e.target));
		if (menu
			&& !menu.classList.contains('hidden')
			&& !clickedInsideMenu
			&& e.target.id !== 'menu-hamburger'
			&& !(shareBtn && shareBtn.contains(e.target))) {
			menu.classList.add('hidden');
		}
	});
}
