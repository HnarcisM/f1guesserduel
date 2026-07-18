(function applySavedThemeBeforeRender() {
    const allowedThemes = new Set(['default', 'neon', 'carbon']);
    let theme = 'default';

    try {
        const savedTheme = globalThis.localStorage?.getItem('f1-guesser-theme');
        if (allowedThemes.has(savedTheme)) theme = savedTheme;
    } catch {
        // Storage can be unavailable in private or restricted browser contexts.
    }

    document.documentElement.setAttribute('data-app-theme', theme);
})();
