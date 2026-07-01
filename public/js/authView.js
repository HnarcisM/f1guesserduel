import { authApi } from './apiClient.js';
import { showErrorToast, showSuccessToast } from './toastController.js';

export function createAuthView({ onAuthChanged } = {}) {
    let currentUser = null;
    let socketAuthToken = null;
    let mode = 'login';

    function getEls() {
        return {
            openBtn: document.getElementById('authOpenBtn'),
            panel: document.getElementById('authPanel'),
            backdrop: document.getElementById('authBackdrop'),
            closeBtn: document.getElementById('authCloseBtn'),
            title: document.getElementById('authTitle'),
            subtitle: document.getElementById('authSubtitle'),
            usernameGroup: document.getElementById('authUsernameGroup'),
            username: document.getElementById('authUsername'),
            email: document.getElementById('authEmail'),
            password: document.getElementById('authPassword'),
            submitBtn: document.getElementById('authSubmitBtn'),
            switchBtn: document.getElementById('authSwitchBtn'),
            message: document.getElementById('authMessage'),
            userBadge: document.getElementById('authUserBadge'),
            logoutBtn: document.getElementById('authLogoutBtn')
        };
    }

    function emitAuthChanged() {
        if (typeof onAuthChanged === 'function') {
            onAuthChanged(currentUser, socketAuthToken);
        }
    }

    function setMessage(message = '', type = 'info') {
        const { message: messageEl } = getEls();
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.dataset.type = type;
    }

    function setMode(nextMode) {
        mode = nextMode === 'register' ? 'register' : 'login';
        const els = getEls();

        if (els.title) els.title.textContent = mode === 'register' ? 'Creează cont' : 'Autentificare';
        if (els.subtitle) {
            els.subtitle.textContent = mode === 'register'
                ? 'Creează un cont pentru profil, statistici și dueluri cu prieteni.'
                : 'Intră în cont ca să pregătim profilul și jocurile cu prieteni.';
        }
        if (els.usernameGroup) els.usernameGroup.classList.toggle('is-hidden', mode !== 'register');
        if (els.submitBtn) els.submitBtn.textContent = mode === 'register' ? 'Creează cont' : 'Login';
        if (els.switchBtn) els.switchBtn.textContent = mode === 'register' ? 'Ai deja cont? Login' : 'Nu ai cont? Register';
        setMessage('');
    }

    function renderUser() {
        const els = getEls();
        const label = currentUser ? `👤 ${currentUser.username}` : '👤 Login';

        if (els.openBtn) els.openBtn.textContent = label;
        if (els.userBadge) {
            els.userBadge.textContent = currentUser
                ? `Logat ca ${currentUser.username}`
                : 'Joci momentan ca Guest.';
        }
        if (els.logoutBtn) els.logoutBtn.classList.toggle('is-hidden', !currentUser);
    }

    function openPanel() {
        const { panel, backdrop } = getEls();
        if (panel) panel.classList.add('show');
        if (backdrop) backdrop.classList.add('show');
        setMode(currentUser ? 'login' : mode);
        renderUser();
    }

    function closePanel() {
        const { panel, backdrop } = getEls();
        if (panel) panel.classList.remove('show');
        if (backdrop) backdrop.classList.remove('show');
    }

    async function refreshCurrentUser() {
        try {
            const data = await authApi.me();
            currentUser = data.user || null;
            socketAuthToken = data.socketAuthToken || null;
            renderUser();
            emitAuthChanged();
        } catch (error) {
            currentUser = null;
            socketAuthToken = null;
            renderUser();
            emitAuthChanged();
        }
    }

    async function submitAuthForm(event) {
        event.preventDefault();
        const els = getEls();
        const email = els.email ? els.email.value.trim() : '';
        const password = els.password ? els.password.value : '';
        const username = els.username ? els.username.value.trim() : '';

        try {
            setMessage('Se procesează...', 'info');
            const data = mode === 'register'
                ? await authApi.register({ username, email, password })
                : await authApi.login({ email, password });

            currentUser = data.user || null;
            socketAuthToken = data.socketAuthToken || null;
            renderUser();
            emitAuthChanged();
            setMessage(currentUser ? `Bun venit, ${currentUser.username}!` : 'Autentificare reușită.', 'success');

            if (els.password) els.password.value = '';
            setTimeout(closePanel, 500);
        } catch (error) {
            setMessage(error.message || 'Nu am putut finaliza autentificarea.', 'error');
        }
    }

    async function logout() {
        try {
            await authApi.logout();
        } catch (error) {
            console.warn('Logout request failed:', error);
        }

        currentUser = null;
        socketAuthToken = null;
        renderUser();
        emitAuthChanged();
        setMessage('Ai ieșit din cont.', 'success');
    }

    function setup() {
        const els = getEls();
        if (els.openBtn) els.openBtn.addEventListener('click', openPanel);
        if (els.closeBtn) els.closeBtn.addEventListener('click', closePanel);
        if (els.backdrop) els.backdrop.addEventListener('click', closePanel);
        if (els.switchBtn) els.switchBtn.addEventListener('click', () => setMode(mode === 'register' ? 'login' : 'register'));
        if (els.logoutBtn) els.logoutBtn.addEventListener('click', logout);
        if (els.panel) {
            const form = els.panel.querySelector('form');
            if (form) form.addEventListener('submit', submitAuthForm);
        }

        setMode('login');
        refreshCurrentUser();
    }

    function getCurrentUser() {
        return currentUser;
    }

    function getSocketAuthToken() {
        return socketAuthToken;
    }

    return {
        setup,
        refreshCurrentUser,
        getCurrentUser,
        getSocketAuthToken,
        openPanel,
        closePanel
    };
}
