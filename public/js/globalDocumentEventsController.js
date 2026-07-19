import { closeNavigationMenu } from './navigationMenuController.js';

export function setupGlobalDocumentEvents(menu, { autocomplete }) {
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
			closeNavigationMenu(menu);
		}
	});
}
