import { accountApi } from './apiClient.js';
import { AVATAR_PRESETS, DEFAULT_AVATAR_KEY } from './authViewElements.js';

export function createAccountSettingsController({
    state,
    getEls,
    renderUser,
    emitAuthChanged,
    clearAuthenticatedState,
    setMessage
} = {}) {
    function setSettingsMessage(message = '', type = 'info') {
        const { settingsMessage } = getEls();
        if (!settingsMessage) return;
        settingsMessage.textContent = message;
        settingsMessage.dataset.type = type;
    }

    function resetAccountSettingsFields({ clearUsername = false } = {}) {
        const els = getEls();
        if (els.settingsUsername) {
            els.settingsUsername.value = clearUsername ? '' : (state.currentUser?.username || '');
            els.settingsUsername.dataset.dirty = 'false';
        }
        if (els.usernameCurrentPassword) els.usernameCurrentPassword.value = '';
        if (els.passwordCurrent) els.passwordCurrent.value = '';
        if (els.passwordNew) els.passwordNew.value = '';
        if (els.passwordConfirm) els.passwordConfirm.value = '';
        if (els.saveUsernameBtn) els.saveUsernameBtn.disabled = false;
        if (els.savePasswordBtn) els.savePasswordBtn.disabled = false;
        if (els.logoutAllBtn) els.logoutAllBtn.disabled = false;
        setSettingsMessage('');
    }

    function renderUsernameCooldown() {
        const els = getEls();
        const availableAt = state.currentUser?.usernameChangeAvailableAt
            ? new Date(state.currentUser.usernameChangeAvailableAt)
            : null;
        const isLocked = availableAt && !Number.isNaN(availableAt.getTime())
            && availableAt.getTime() > Date.now();

        if (els.usernameCooldownHint) {
            els.usernameCooldownHint.classList.toggle('is-locked', Boolean(isLocked));
            els.usernameCooldownHint.textContent = isLocked
                ? `Următoarea schimbare este disponibilă pe ${new Intl.DateTimeFormat('ro-RO', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).format(availableAt)}.`
                : 'Schimbarea username-ului este disponibilă acum.';
        }
        if (els.settingsUsername) els.settingsUsername.disabled = Boolean(isLocked);
        if (els.usernameCurrentPassword) els.usernameCurrentPassword.disabled = Boolean(isLocked);
        if (els.saveUsernameBtn) els.saveUsernameBtn.disabled = !state.currentUser || Boolean(isLocked);
    }

    function normalizeAvatarKey(avatarKey) {
        const value = String(avatarKey || '').trim().toLowerCase();
        return AVATAR_PRESETS.some(preset => preset.key === value) ? value : DEFAULT_AVATAR_KEY;
    }

    function renderAvatarSelection() {
        const els = getEls();
        state.selectedAvatarKey = normalizeAvatarKey(state.selectedAvatarKey);
        if (els.accountAvatar) els.accountAvatar.dataset.avatarKey = state.selectedAvatarKey;
        for (const preset of els.avatarPresetButtons) {
            preset.element?.setAttribute('aria-pressed', String(preset.key === state.selectedAvatarKey));
        }
        if (els.saveAvatarBtn) {
            const savedAvatarKey = normalizeAvatarKey(state.currentUser?.avatarKey);
            els.saveAvatarBtn.disabled = !state.currentUser || state.selectedAvatarKey === savedAvatarKey;
        }
    }

    function selectAvatarPreset(avatarKey) {
        if (!state.currentUser) return;
        state.selectedAvatarKey = normalizeAvatarKey(avatarKey);
        renderAvatarSelection();
    }

    async function submitUsernameSettings(event) {
        event.preventDefault();
        if (!state.currentUser) return;
        const requestedStateVersion = ++state.authStateVersion;
        const els = getEls();
        const username = els.settingsUsername?.value.trim() || '';
        const currentPassword = els.usernameCurrentPassword?.value || '';
        if (els.saveUsernameBtn) els.saveUsernameBtn.disabled = true;
        if (els.accountStatsMessage) els.accountStatsMessage.textContent = '';
        setSettingsMessage('Se salvează username-ul…');

        try {
            const data = await accountApi.updateProfile({ username, currentPassword });
            if (requestedStateVersion !== state.authStateVersion || !state.currentUser) return;
            state.currentUser = data.user || state.currentUser;
            state.socketAuthToken = data.socketAuthToken || state.socketAuthToken;
            if (els.settingsUsername) els.settingsUsername.dataset.dirty = 'false';
            if (els.usernameCurrentPassword) els.usernameCurrentPassword.value = '';
            renderUser();
            emitAuthChanged();
            setSettingsMessage('Username-ul a fost actualizat.', 'success');
        } catch (error) {
            if (requestedStateVersion !== state.authStateVersion || !state.currentUser) return;
            setSettingsMessage(error.message || 'Username-ul nu a putut fi actualizat.', 'error');
        } finally {
            renderUsernameCooldown();
        }
    }

    async function submitPasswordSettings(event) {
        event.preventDefault();
        if (!state.currentUser) return;
        const els = getEls();
        const currentPassword = els.passwordCurrent?.value || '';
        const newPassword = els.passwordNew?.value || '';
        const confirmPassword = els.passwordConfirm?.value || '';
        if (newPassword !== confirmPassword) {
            setSettingsMessage('Confirmarea parolei nu coincide cu parola nouă.', 'error');
            return;
        }

        const requestedStateVersion = ++state.authStateVersion;
        if (els.savePasswordBtn) els.savePasswordBtn.disabled = true;
        if (els.accountStatsMessage) els.accountStatsMessage.textContent = '';
        setSettingsMessage('Se schimbă parola…');
        try {
            const data = await accountApi.updatePassword({ currentPassword, newPassword });
            if (requestedStateVersion !== state.authStateVersion || !state.currentUser) return;
            state.currentUser = data.user || state.currentUser;
            state.socketAuthToken = data.socketAuthToken || state.socketAuthToken;
            if (els.passwordCurrent) els.passwordCurrent.value = '';
            if (els.passwordNew) els.passwordNew.value = '';
            if (els.passwordConfirm) els.passwordConfirm.value = '';
            emitAuthChanged();
            const revokedCount = Number(data.sessionsRevoked) || 0;
            setSettingsMessage(
                revokedCount > 0
                    ? `Parola a fost schimbată. ${revokedCount} ${revokedCount === 1 ? 'altă sesiune a fost închisă' : 'alte sesiuni au fost închise'}.`
                    : 'Parola a fost schimbată.',
                'success'
            );
        } catch (error) {
            if (requestedStateVersion !== state.authStateVersion || !state.currentUser) return;
            setSettingsMessage(error.message || 'Parola nu a putut fi schimbată.', 'error');
        } finally {
            if (els.savePasswordBtn) els.savePasswordBtn.disabled = false;
        }
    }

    async function saveAvatar() {
        if (!state.currentUser) return;
        const requestedStateVersion = ++state.authStateVersion;
        const { saveAvatarBtn } = getEls();
        if (saveAvatarBtn) saveAvatarBtn.disabled = true;
        setSettingsMessage('Se salvează avatarul…');
        try {
            const data = await accountApi.updateAvatar({ avatarKey: state.selectedAvatarKey });
            if (requestedStateVersion !== state.authStateVersion || !state.currentUser) return;
            state.currentUser = data.user || state.currentUser;
            state.socketAuthToken = data.socketAuthToken || state.socketAuthToken;
            state.selectedAvatarKey = normalizeAvatarKey(state.currentUser.avatarKey);
            renderUser();
            emitAuthChanged();
            setSettingsMessage('Avatarul a fost actualizat.', 'success');
        } catch (error) {
            if (requestedStateVersion !== state.authStateVersion || !state.currentUser) return;
            setSettingsMessage(error.message || 'Avatarul nu a putut fi actualizat.', 'error');
        } finally {
            renderAvatarSelection();
        }
    }

    async function logoutEverywhere() {
        if (!state.currentUser) return;
        const confirmed = typeof globalThis.confirm === 'function'
            && globalThis.confirm('Sigur vrei să închizi toate sesiunile acestui cont?');
        if (!confirmed) return;

        const requestedStateVersion = ++state.authStateVersion;
        const { logoutAllBtn } = getEls();
        if (logoutAllBtn) logoutAllBtn.disabled = true;
        setSettingsMessage('Se închid toate sesiunile…');
        try {
            await accountApi.logoutAll();
            if (requestedStateVersion !== state.authStateVersion) return;
            clearAuthenticatedState();
            setMessage('Ai ieșit din cont pe toate dispozitivele.', 'success');
        } catch (error) {
            if (requestedStateVersion !== state.authStateVersion || !state.currentUser) return;
            setSettingsMessage(error.message || 'Sesiunile nu au putut fi închise.', 'error');
        } finally {
            if (logoutAllBtn) logoutAllBtn.disabled = false;
        }
    }

    function setup() {
        const els = getEls();
        if (els.usernameSettingsForm) els.usernameSettingsForm.addEventListener('submit', submitUsernameSettings);
        if (els.passwordSettingsForm) els.passwordSettingsForm.addEventListener('submit', submitPasswordSettings);
        for (const preset of els.avatarPresetButtons) {
            preset.element?.addEventListener('click', () => selectAvatarPreset(preset.key));
        }
        if (els.saveAvatarBtn) els.saveAvatarBtn.addEventListener('click', saveAvatar);
        if (els.settingsUsername) {
            els.settingsUsername.addEventListener('input', () => { els.settingsUsername.dataset.dirty = 'true'; });
        }
        if (els.logoutAllBtn) els.logoutAllBtn.addEventListener('click', logoutEverywhere);
    }

    return {
        normalizeAvatarKey,
        renderAvatarSelection,
        renderUsernameCooldown,
        resetAccountSettingsFields,
        setup
    };
}
