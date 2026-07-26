import { closeNavigationMenu, setNavigationMenuOpen } from './navigationMenuController.js';
import { setupThemeMenu } from './themeMenuController.js';

function updateAccountBadge(documentObject, user) {
    const profileButton = documentObject.getElementById('authOpenBtn');
    const legacyBadge = documentObject.getElementById('modePageAccount');

    if (profileButton) {
        profileButton.textContent = user?.username ? `👤 ${user.username}` : '👤 Login';
        profileButton.title = user?.username
            ? `Deschide profilul lui ${user.username}`
            : 'Autentifică-te sau creează un cont';
        profileButton.dataset.authenticated = String(Boolean(user));
    }

    if (legacyBadge) {
        legacyBadge.textContent = user?.username ? `👤 ${user.username}` : '👤 Guest';
        legacyBadge.title = user?.username
            ? `Autentificat ca ${user.username}`
            : 'Weekly Challenge necesită autentificare.';
        legacyBadge.dataset.authenticated = String(Boolean(user));
    }
}

function normalizeInternalPath(pathname) {
    const normalized = String(pathname || '').trim();
    if (!normalized.startsWith('/') || normalized.startsWith('//')) return null;
    return normalized;
}

function navigateToPath(windowObject, socket, pathname) {
    const targetPath = normalizeInternalPath(pathname);
    if (!targetPath) return false;
    socket?.emit?.('leaveExtendedMode');
    windowObject.location.assign(targetPath);
    return true;
}

function navigateHome(windowObject, socket) {
    return navigateToPath(windowObject, socket, '/');
}

function installClassicHeaderNavigation({ windowObject, documentObject, socket }) {
    const menuButton = documentObject.getElementById('menu-hamburger');
    const menu = documentObject.getElementById('dropdown-menu');

    if (menuButton && menu) {
        menuButton.addEventListener('click', event => {
            event.stopPropagation();
            setNavigationMenuOpen(menu, menu.classList.contains('hidden'));
        });
        menuButton.addEventListener('keydown', event => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault();
            setNavigationMenuOpen(menu, true, { focusFirst: true });
        });
        menu.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            closeNavigationMenu(menu, { restoreFocus: true });
        });
        documentObject.addEventListener('click', event => {
            if (menu.classList.contains('hidden')) return;
            if (menu.contains(event.target) || event.target === menuButton) return;
            closeNavigationMenu(menu);
        });
        setNavigationMenuOpen(menu, false);
        setupThemeMenu(menu);
    }

    documentObject.getElementById('siteHomeControl')?.addEventListener('click', () => {
        navigateHome(windowObject, socket);
    });

    documentObject.querySelectorAll('[data-mode-path]').forEach(control => {
        control.addEventListener('click', () => {
            const targetPath = normalizeInternalPath(control.dataset.modePath);
            if (!targetPath) return;
            const currentPath = windowObject.location.pathname.replace(/index\.html$/, '');
            closeNavigationMenu(menu, { restoreFocus: true });
            if (targetPath === currentPath) return;
            navigateToPath(windowObject, socket, targetPath);
        });
    });
}

function installPageNavigation({ windowObject, documentObject, socket }) {
    documentObject.addEventListener('click', event => {
        const action = event.target?.closest?.('#extendedModeClose, #extendedHome');
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        navigateHome(windowObject, socket);
    }, true);

    installClassicHeaderNavigation({ windowObject, documentObject, socket });

    const profileButton = documentObject.getElementById('authOpenBtn');
    const embeddedProfilePanel = documentObject.getElementById('authPanel');
    if (profileButton && !embeddedProfilePanel) {
        profileButton.addEventListener('click', () => {
            try {
                windowObject.sessionStorage?.setItem?.('f1-mode-return-path', windowObject.location.pathname);
            } catch {
                // The return path is optional when the profile is not embedded.
            }
            socket?.emit?.('leaveExtendedMode');
            windowObject.location.assign('/#login');
        });
    }
}

export {
    installClassicHeaderNavigation,
    installPageNavigation,
    navigateHome,
    navigateToPath,
    normalizeInternalPath,
    updateAccountBadge
};
