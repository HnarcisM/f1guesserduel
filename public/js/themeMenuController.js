import { safeGetItem, safeSetItem } from './safeStorage.js';

const THEME_STORAGE_KEY = 'f1-guesser-theme';
const ALLOWED_THEMES = new Set(['default', 'neon', 'carbon']);

export function normalizeTheme(theme) {
	return ALLOWED_THEMES.has(theme) ? theme : 'default';
}

export function applyTheme(theme) {
	const normalizedTheme = normalizeTheme(theme);
	const root = document.documentElement || document.body;
	root?.setAttribute?.('data-app-theme', normalizedTheme);

	if (document.body && document.body !== root) {
		document.body.removeAttribute?.('data-app-theme');
	}

	return normalizedTheme;
}

export function setupThemeMenu(menu) {
	const savedTheme = safeGetItem(THEME_STORAGE_KEY, 'default');
	applyTheme(savedTheme);

	document.querySelectorAll('.theme-item').forEach(item => {
		item.addEventListener('click', function(e) {
			e.stopPropagation();
			const selectedTheme = applyTheme(this.getAttribute('data-theme'));
			safeSetItem(THEME_STORAGE_KEY, selectedTheme);
			if (menu) menu.classList.add('hidden');
		});
	});
}
