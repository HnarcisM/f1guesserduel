(function installGameHubProfileView(globalObject) {
  'use strict';

  function resolveCore() {
    if (globalObject?.F1GameHubViewCore) return globalObject.F1GameHubViewCore;
    if (typeof module !== 'undefined' && module.exports) return require('./gameHubViewCore.js');
    return null;
  }

  const core = resolveCore();
  if (!core) throw new Error('Game Hub profile view requires F1GameHubViewCore.');
  const {
    asNonNegativeInteger,
    createElement,
    normalizeAvatarKey,
    setProgressPercent
  } = core;

  function ensureHeaderProfileMarkup(documentObject, user = null) {
    const button = documentObject?.getElementById?.('authOpenBtn');
    if (!button) return null;

    let avatar = button.querySelector?.('#authHeaderAvatar');
    let username = button.querySelector?.('#authHeaderUsername');
    let status = button.querySelector?.('#authHeaderStatus');
    if (!avatar || !username || !status) {
      avatar = createElement(documentObject, 'span', 'auth-header-avatar auth-avatar-visual');
      avatar.id = 'authHeaderAvatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.append(createElement(documentObject, 'span', 'auth-helmet-icon'));
      username = createElement(documentObject, 'span', 'auth-header-username');
      username.id = 'authHeaderUsername';
      status = createElement(documentObject, 'span', 'auth-header-status');
      status.id = 'authHeaderStatus';
      status.setAttribute('aria-hidden', 'true');
      button.replaceChildren(avatar, username, status);
    }

    const isAuthenticated = Boolean(user);
    const displayName = isAuthenticated ? String(user.username || 'Utilizator') : 'Login';
    avatar.dataset.avatarKey = normalizeAvatarKey(user?.avatarKey);
    username.textContent = displayName;
    button.classList.toggle('is-authenticated', isAuthenticated);
    button.setAttribute('aria-label', isAuthenticated ? `Deschide profilul lui ${displayName}` : 'Deschide autentificarea');
    button.title = isAuthenticated ? `Profil: ${displayName}` : 'Autentificare';
    return button;
  }

  function renderProfileSnapshot(documentObject, user = null, summary = null, options = {}) {
    const isAuthenticated = Boolean(user);
    const hasSummary = Boolean(summary && typeof summary === 'object');
    const stats = summary?.stats || (summary?.totals ? summary : {});
    const totals = stats?.totals || {};
    const progress = summary?.progress || {};
    const level = Math.max(1, asNonNegativeInteger(progress.level));
    const xpIntoLevel = asNonNegativeInteger(progress.xpIntoLevel);
    const xpForLevel = Math.max(1, asNonNegativeInteger(progress.xpForLevel) || 100);
    const progressPercent = isAuthenticated && hasSummary
      ? Math.min(100, asNonNegativeInteger(progress.progressPercent))
      : 0;

    const profile = documentObject?.getElementById?.('gameHubProfileSummary');
    const avatar = documentObject?.getElementById?.('gameHubProfileAvatar');
    const username = documentObject?.getElementById?.('gameHubProfileUsername');
    const levelElement = documentObject?.getElementById?.('gameHubProfileLevel');
    const xpText = documentObject?.getElementById?.('gameHubProfileXpText');
    const xpProgress = documentObject?.getElementById?.('gameHubProfileXpProgress');
    const xpBar = documentObject?.getElementById?.('gameHubProfileXpBar');
    const status = documentObject?.getElementById?.('gameHubProfileStatus');
    const victories = documentObject?.getElementById?.('gameHubProfileVictories');
    const accuracy = documentObject?.getElementById?.('gameHubProfileAccuracy');
    const activeDays = documentObject?.getElementById?.('gameHubProfileActiveDays');
    const played = documentObject?.getElementById?.('gameHubProfilePlayed');

    profile?.classList.toggle('is-guest', !isAuthenticated);
    profile?.classList.toggle('is-authenticated', isAuthenticated);
    if (avatar) avatar.dataset.avatarKey = normalizeAvatarKey(user?.avatarKey);
    if (username) username.textContent = isAuthenticated ? String(user.username || 'Utilizator') : 'Guest';
    if (levelElement) {
      levelElement.textContent = isAuthenticated
        ? (hasSummary ? `Nivel ${level}` : 'Nivel …')
        : 'Nivel —';
    }
    if (xpText) {
      xpText.textContent = isAuthenticated
        ? (hasSummary ? `${xpIntoLevel} / ${xpForLevel} XP` : 'Se încarcă progresul…')
        : 'Autentifică-te pentru progres';
    }
    const appliedPercent = setProgressPercent(xpBar, progressPercent);
    if (xpProgress) xpProgress.setAttribute('aria-valuenow', String(appliedPercent));
    if (victories) victories.textContent = isAuthenticated && hasSummary ? String(asNonNegativeInteger(totals.won)) : '—';
    if (accuracy) {
      const accuracyValue = totals.accuracy ?? totals.winRate;
      accuracy.textContent = isAuthenticated && hasSummary ? `${asNonNegativeInteger(accuracyValue)}%` : '—';
    }
    if (activeDays) {
      activeDays.textContent = isAuthenticated && hasSummary
        ? String(asNonNegativeInteger(totals.activeDays))
        : '—';
    }
    if (played) played.textContent = isAuthenticated && hasSummary ? String(asNonNegativeInteger(totals.played)) : '—';
    if (status) {
      status.textContent = options.error
        ? 'Statisticile profilului nu au putut fi încărcate.'
        : (isAuthenticated
          ? (hasSummary ? 'Statisticile profilului sunt actualizate.' : 'Se încarcă statisticile profilului…')
          : 'Autentifică-te pentru a vedea progresul profilului.');
    }
  }

  async function requestJson(fetchImpl, url) {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Datele profilului nu au putut fi încărcate.');
    return data;
  }

  function installGameHubProfileSync({
    documentObject = globalObject?.document,
    fetchImpl = globalObject?.fetch?.bind(globalObject),
    MutationObserverClass = globalObject?.MutationObserver
  } = {}) {
    if (!documentObject || typeof fetchImpl !== 'function') return null;

    let refreshVersion = 0;
    let refreshTimer = null;
    let observer = null;
    let currentUser = null;
    let activeSocket = null;

    function handleAccountStatsUpdated(payload = {}) {
      if (!currentUser) return;
      const payloadUserId = payload.userId;
      if (payloadUserId !== null && payloadUserId !== undefined
        && currentUser.id !== null && currentUser.id !== undefined
        && String(payloadUserId) !== String(currentUser.id)) {
        return;
      }
      renderProfileSnapshot(documentObject, currentUser, {
        stats: payload.stats || null,
        progress: payload.progress || null
      });
    }

    function attachSocket(socket) {
      if (!socket || socket === activeSocket || typeof socket.on !== 'function') return;
      activeSocket?.off?.('accountStatsUpdated', handleAccountStatsUpdated);
      activeSocket = socket;
      activeSocket.on('accountStatsUpdated', handleAccountStatsUpdated);
    }

    function handleSocketCreated(event) {
      attachSocket(event?.detail?.socket);
    }

    async function refresh() {
      const requestVersion = ++refreshVersion;
      try {
        const authData = await requestJson(fetchImpl, '/api/auth/me');
        if (requestVersion !== refreshVersion) return;
        let user = authData.user || null;
        currentUser = user;
        ensureHeaderProfileMarkup(documentObject, user);
        renderProfileSnapshot(documentObject, user, null);
        if (!user) return;

        try {
          const summary = await requestJson(fetchImpl, '/api/account/summary');
          if (requestVersion !== refreshVersion) return;
          user = summary.user || user;
          currentUser = user;
          ensureHeaderProfileMarkup(documentObject, user);
          renderProfileSnapshot(documentObject, user, summary);
        } catch {
          if (requestVersion !== refreshVersion) return;
          ensureHeaderProfileMarkup(documentObject, user);
          renderProfileSnapshot(documentObject, user, null, { error: true });
        }
      } catch {
        if (requestVersion !== refreshVersion) return;
        currentUser = null;
        ensureHeaderProfileMarkup(documentObject, null);
        renderProfileSnapshot(documentObject, null, null);
      }
    }

    function scheduleRefresh(delay = 0) {
      if (refreshTimer !== null) globalObject?.clearTimeout?.(refreshTimer);
      refreshTimer = globalObject?.setTimeout?.(() => {
        refreshTimer = null;
        refresh();
      }, delay) ?? null;
    }

    globalObject?.addEventListener?.('f1:socket-created', handleSocketCreated);
    attachSocket(globalObject?.__f1GameSocket);

    const authButton = documentObject.getElementById?.('authOpenBtn');
    if (authButton && typeof MutationObserverClass === 'function') {
      observer = new MutationObserverClass(() => {
        if (!authButton.querySelector?.('#authHeaderUsername')) scheduleRefresh(0);
      });
      observer.observe(authButton, { childList: true, characterData: true, subtree: true });
    }

    scheduleRefresh(0);
    return {
      refresh,
      disconnect() {
        refreshVersion += 1;
        if (refreshTimer !== null) globalObject?.clearTimeout?.(refreshTimer);
        observer?.disconnect?.();
        activeSocket?.off?.('accountStatsUpdated', handleAccountStatsUpdated);
        globalObject?.removeEventListener?.('f1:socket-created', handleSocketCreated);
      }
    };
  }


  const api = Object.freeze({
    ensureHeaderProfileMarkup,
    installGameHubProfileSync,
    renderProfileSnapshot
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) globalObject.F1GameHubProfileView = api;
}(typeof globalThis !== 'undefined' ? globalThis : null));
