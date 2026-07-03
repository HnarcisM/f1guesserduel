import { safeGetItem, safeSetItem } from './safeStorage.js';

export function setupThemeMenu(menu) {
	const savedTheme = safeGetItem('f1-guesser-theme', 'default');
	document.body.setAttribute('data-app-theme', savedTheme);

	document.querySelectorAll('.theme-item').forEach(item => {
		item.addEventListener('click', function(e) {
			e.stopPropagation();
			const selectedTheme = this.getAttribute('data-theme');
			document.body.setAttribute('data-app-theme', selectedTheme);
			safeSetItem('f1-guesser-theme', selectedTheme);
			if (menu) menu.classList.add('hidden');
		});
	});
}
