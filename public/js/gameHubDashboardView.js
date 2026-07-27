(function installGameHubDashboardView(globalObject) {
  'use strict';

  function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  const HEADER_AVATAR_KEYS = new Set([
    'helmet-red',
    'helmet-blue',
    'helmet-yellow',
    'helmet-green',
    'helmet-orange',
    'helmet-purple',
    'helmet-cyan',
    'helmet-white'
  ]);

  const DUEL_ROOM_PREVIEW_LIMIT = 3;


  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const DEFAULT_GAME_HUB_ICON = 'sparkles';
  const GAME_HUB_ICON_DEFINITIONS = Object.freeze({
    trophy: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 4h8v3a4 4 0 0 1-8 0V4Z' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 6H5a2 2 0 0 0 2 3h1M16 6h3a2 2 0 0 1-2 3h-1M12 11v4M9 20h6M10 15h4v5h-4z' }) })
    ]),
    target: Object.freeze([
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '8' }) }),
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '12', r: '3' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M12 2v3M22 12h-3M12 22v-3M2 12h3' }) })
    ]),
    sunrise: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4 15a8 8 0 0 1 16 0M2 19h20M5 22h14M12 2v4M4.5 6.5l2.2 2.2M19.5 6.5l-2.2 2.2' }) })
    ]),
    swords: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M14 5 18.5 2 22 2.5 21.5 6 18 9.5M13 7l4 4M3 3l8 8-3 3-4-1-1-4 3-3M14 14l7 7M17 14l3 3' }) })
    ]),
    stopwatch: Object.freeze([
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '12', cy: '13', r: '8' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9 2h6M12 2v3M18 7l2-2M12 13l3-2' }) })
    ]),
    landmark: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm3 9 9-6 9 6M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 18h18M2 21h20' }) })
    ]),
    flame: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M13 2c1 4-2 5-2 8 0 1.7 1.3 3 3 3 2.5 0 4-2.2 3.4-4.6C20.8 11 21 14.8 19 18a8 8 0 0 1-14 0c-2.2-4.1.3-8 3.5-10.5C8 10.8 9.6 12 11 12c-1.3-4 1.8-6.3 2-10Z' }) })
    ]),
    calendar: Object.freeze([
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '3', y: '5', width: '18', height: '16', rx: '3' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M8 2v6M16 2v6M3 10h18M8 15l2 2 5-5' }) })
    ]),
    car: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M3 14 5.5 8h11L21 14v4h-2M5 18H3v-4h18M7 18h10M7 14h10' }) }),
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '7', cy: '18', r: '2' }) }),
      Object.freeze({ tag: 'circle', attributes: Object.freeze({ cx: '17', cy: '18', r: '2' }) })
    ]),
    puzzle: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M4 4h6a2 2 0 1 1 4 0h6v6a2 2 0 1 1 0 4v6h-6a2 2 0 1 0-4 0H4v-6a2 2 0 1 1 0-4V4Z' }) })
    ]),
    map: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3V5ZM9 2v17M15 5v17' }) })
    ]),
    sparkles: Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'm12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z' }) })
    ]),
    grid: Object.freeze([
      Object.freeze({ tag: 'rect', attributes: Object.freeze({ x: '3', y: '3', width: '18', height: '18', rx: '3' }) }),
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M9 3v18M15 3v18M3 9h18M3 15h18' }) })
    ]),
    'arrow-right': Object.freeze([
      Object.freeze({ tag: 'path', attributes: Object.freeze({ d: 'M5 12h14M14 7l5 5-5 5' }) })
    ])
  });

  function createSvgElement(documentObject, tagName) {
    if (typeof documentObject?.createElementNS === 'function') {
      return documentObject.createElementNS(SVG_NAMESPACE, tagName);
    }
    return documentObject.createElement(tagName);
  }

  function createGameHubIcon(documentObject, iconKey, className = 'game-hub-svg-icon') {
    const usesFallback = !Object.hasOwn(GAME_HUB_ICON_DEFINITIONS, iconKey);
    const normalizedKey = usesFallback ? DEFAULT_GAME_HUB_ICON : iconKey;
    const svg = createSvgElement(documentObject, 'svg');
    svg.setAttribute('class', className);
    if (typeof svg.className === 'string') svg.className = className;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.dataset.iconKey = normalizedKey;
    if (usesFallback) svg.dataset.iconFallback = 'true';

    for (const definition of GAME_HUB_ICON_DEFINITIONS[normalizedKey]) {
      const shape = createSvgElement(documentObject, definition.tag);
      for (const [name, value] of Object.entries(definition.attributes)) {
        shape.setAttribute(name, value);
      }
      svg.append(shape);
    }
    return svg;
  }

  function asNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeAvatarKey(value) {
    const avatarKey = String(value || '').trim();
    return HEADER_AVATAR_KEYS.has(avatarKey) ? avatarKey : 'helmet-red';
  }

  function getActiveStreak(stats = {}) {
    return Math.max(
      0,
      ...Object.values(stats.modes || {}).map(mode => asNonNegativeInteger(mode?.currentStreak))
    );
  }

  function setProgressPercent(element, value) {
    const numericValue = Number(value);
    const percent = Number.isFinite(numericValue)
      ? Math.round(Math.min(100, Math.max(0, numericValue)))
      : 0;
    if (!element) return percent;

    const previousValue = element.dataset.progressPercent;
    if (/^(?:100|[1-9]?\d)$/.test(previousValue || '')) {
      element.classList.remove(`progress-percent-${previousValue}`);
    }
    element.classList.add('has-progress-percent', `progress-percent-${percent}`);
    element.dataset.progressPercent = String(percent);
    return percent;
  }

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

  function sanitizeDuelPreviewText(value, fallback, maxLength = 48) {
    const normalized = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return (normalized || fallback).slice(0, maxLength);
  }

  function getDuelDifficultyLabel(room = {}) {
    const difficulty = String(room.lobbySettings?.difficulty || 'easy').toLowerCase();
    if (difficulty === 'hard') return 'Hard';
    if (difficulty === 'medium') return 'Medium';
    return 'Easy';
  }

  function getDuelTimerLabel(room = {}) {
    const settings = room.lobbySettings || {};
    return settings.timed
      ? `${Math.max(1, asNonNegativeInteger(settings.timeLimitSeconds) || 60)}s`
      : 'Fără timp';
  }

  function normalizeDuelPlayerPreview(player = {}, fallbackUsername = 'Jucător') {
    return {
      username: sanitizeDuelPreviewText(player.username, fallbackUsername, 20),
      avatarKey: normalizeAvatarKey(player.avatarKey),
      isHost: player.isHost === true,
      connected: player.connected !== false
    };
  }

  function normalizeDuelRoomPreview(room = {}) {
    const playerCount = asNonNegativeInteger(room.playerCount);
    const spectatorCount = asNonNegativeInteger(room.spectatorCount);
    const maxPlayers = Math.max(1, asNonNegativeInteger(room.maxPlayers) || 2);
    const totalCount = Math.max(
      playerCount + spectatorCount,
      asNonNegativeInteger(room.totalCount)
    );
    const rawRoundState = String(room.roundState || 'waiting').toLowerCase();
    const roundState = ['waiting', 'playing', 'finished'].includes(rawRoundState)
      ? rawRoundState
      : 'waiting';
    const rawPlayers = Array.isArray(room.players) ? room.players : [];
    const players = rawPlayers
      .slice()
      .sort((left, right) => Number(right?.isHost === true) - Number(left?.isHost === true))
      .slice(0, maxPlayers)
      .map((player, index) => normalizeDuelPlayerPreview(player, `Jucător ${index + 1}`));

    if (players.length === 0 && room.hostUsername) {
      players.push(normalizeDuelPlayerPreview({
        username: room.hostUsername,
        avatarKey: room.hostAvatarKey,
        isHost: true,
        connected: true
      }, 'Host necunoscut'));
    }

    return {
      roomId: sanitizeDuelPreviewText(room.roomId, '--', 16),
      hostUsername: sanitizeDuelPreviewText(room.hostUsername, 'Host necunoscut', 32),
      players,
      playerCount,
      spectatorCount,
      maxPlayers,
      totalCount,
      roundState,
      canJoinAsPlayer: room.canJoinAsPlayer !== false && playerCount < maxPlayers,
      difficultyLabel: getDuelDifficultyLabel(room),
      timerLabel: getDuelTimerLabel(room)
    };
  }

  function createDuelRoomPlayer(documentObject, player = null, seatIndex = 0) {
    const isOpenSeat = !player;
    const wrapper = createElement(
      documentObject,
      'span',
      `game-hub-duel-player${isOpenSeat ? ' is-open-seat' : ''}${player?.connected === false ? ' is-disconnected' : ''}`
    );
    const avatar = createElement(
      documentObject,
      'span',
      `game-hub-duel-player-avatar${isOpenSeat ? ' is-open-seat' : ' auth-avatar-visual'}`
    );
    avatar.setAttribute('aria-hidden', 'true');

    if (isOpenSeat) {
      avatar.textContent = '+';
    } else {
      avatar.dataset.avatarKey = normalizeAvatarKey(player.avatarKey);
      avatar.append(createElement(documentObject, 'span', 'auth-helmet-icon'));
    }

    const copy = createElement(documentObject, 'span', 'game-hub-duel-player-copy');
    copy.append(
      createElement(
        documentObject,
        'strong',
        'game-hub-duel-player-name',
        isOpenSeat ? 'Loc liber' : player.username
      ),
      createElement(
        documentObject,
        'small',
        'game-hub-duel-player-role',
        isOpenSeat
          ? `Jucător ${seatIndex + 1}`
          : `${player.isHost ? 'Host' : `Jucător ${seatIndex + 1}`}${player.connected ? '' : ' · offline'}`
      )
    );
    wrapper.append(avatar, copy);
    return wrapper;
  }

  function createDuelRoomPlayers(documentObject, room = {}) {
    const players = Array.isArray(room.players) ? room.players.slice(0, room.maxPlayers || 2) : [];
    const group = createElement(documentObject, 'span', 'game-hub-duel-room-players');
    const firstPlayer = players[0] || null;
    const secondPlayer = players[1] || null;
    group.setAttribute(
      'aria-label',
      `Jucători: ${firstPlayer?.username || 'loc liber'} versus ${secondPlayer?.username || 'loc liber'}`
    );
    group.append(
      createDuelRoomPlayer(documentObject, firstPlayer, 0),
      createElement(documentObject, 'span', 'game-hub-duel-player-versus', 'VS'),
      createDuelRoomPlayer(documentObject, secondPlayer, 1)
    );
    return group;
  }

  function normalizeDuelRoomListPayload(payload = {}) {
    const rawRooms = Array.isArray(payload) ? payload : payload?.rooms;
    const rooms = Array.isArray(rawRooms)
      ? rawRooms.slice(0, 50).filter(room => room && room.roomId).map(normalizeDuelRoomPreview)
      : [];
    const announcedTotal = Array.isArray(payload)
      ? rooms.length
      : asNonNegativeInteger(payload?.totalRooms);

    return {
      rooms,
      totalRooms: Math.max(rooms.length, announcedTotal),
      generatedAt: Number(payload?.generatedAt) || null
    };
  }

  function getDuelRoomBadge(room = {}) {
    if (room.roundState === 'playing') return { label: 'Live', className: 'is-live' };
    if (room.roundState === 'finished') return { label: 'Final', className: 'is-finished' };
    if (!room.canJoinAsPlayer) return { label: 'Plină', className: 'is-full' };
    return { label: 'Lobby', className: 'is-lobby' };
  }

  function createDuelStateItem(documentObject, {
    title,
    meta,
    badge,
    className = ''
  }) {
    const item = createElement(
      documentObject,
      'span',
      `game-hub-duel-room-item game-hub-duel-room-state ${className}`.trim()
    );
    const copy = createElement(documentObject, 'span', 'game-hub-duel-room-copy');
    copy.append(
      createElement(documentObject, 'strong', 'game-hub-duel-room-title', title),
      createElement(documentObject, 'small', 'game-hub-duel-room-meta', meta)
    );
    item.append(copy, createElement(documentObject, 'span', 'game-hub-duel-room-live is-state', badge));
    return item;
  }

  function createDuelRoomPreviewItem(documentObject, room = {}) {
    const normalizedRoom = normalizeDuelRoomPreview(room);
    const badge = getDuelRoomBadge(normalizedRoom);
    const item = createElement(
      documentObject,
      'span',
      `game-hub-duel-room-item game-hub-duel-room-item--${normalizedRoom.roundState}`
    );
    item.dataset.roomId = normalizedRoom.roomId;
    const copy = createElement(documentObject, 'span', 'game-hub-duel-room-copy');
    copy.append(
      createElement(
        documentObject,
        'strong',
        'game-hub-duel-room-title',
        `Camera ${normalizedRoom.roomId}`
      ),
      createDuelRoomPlayers(documentObject, normalizedRoom),
      createElement(
        documentObject,
        'small',
        'game-hub-duel-room-meta',
        `${normalizedRoom.playerCount}/${normalizedRoom.maxPlayers} jucători · `
          + `${normalizedRoom.spectatorCount} spectatori · `
          + `${normalizedRoom.difficultyLabel} · ${normalizedRoom.timerLabel}`
      )
    );
    const badgeElement = createElement(
      documentObject,
      'span',
      `game-hub-duel-room-live ${badge.className}`,
      badge.label
    );
    item.append(copy, badgeElement);
    return item;
  }

  function updateDuelFeatureValue(documentObject, id, value) {
    const element = documentObject?.getElementById?.(id);
    if (element) element.textContent = String(value);
  }

  function renderDuelRoomSnapshot(documentObject, payload = {}, options = {}) {
    if (!documentObject) return null;
    const normalizedPayload = normalizeDuelRoomListPayload(payload);
    const rooms = normalizedPayload.rooms;
    const activeMatches = rooms.filter(room => room.roundState === 'playing').length;
    const participants = rooms.reduce((total, room) => total + room.totalCount, 0);
    const state = options.state || 'ready';
    const list = documentObject.getElementById?.('gameHubDuelRoomItems');
    const listTitle = documentObject.getElementById?.('gameHubDuelRoomListTitle');
    const status = documentObject.getElementById?.('gameHubDuelRoomStatus');
    const card = documentObject.getElementById?.('gameHubDuelCard');

    updateDuelFeatureValue(documentObject, 'gameHubDuelActiveRooms', normalizedPayload.totalRooms);
    updateDuelFeatureValue(documentObject, 'gameHubDuelActiveMatches', activeMatches);
    updateDuelFeatureValue(documentObject, 'gameHubDuelParticipants', participants);
    if (listTitle) listTitle.textContent = `Camere active (${normalizedPayload.totalRooms})`;

    card?.classList.toggle('has-live-rooms', normalizedPayload.totalRooms > 0);
    card?.classList.toggle('is-room-list-offline', state === 'offline' || state === 'error');
    if (card) {
      card.dataset.activeRooms = String(normalizedPayload.totalRooms);
      card.dataset.activeMatches = String(activeMatches);
      card.dataset.duelParticipants = String(participants);
    }

    if (list) {
      list.replaceChildren();
      if (state === 'loading' && rooms.length === 0) {
        list.append(createDuelStateItem(documentObject, {
          title: 'Se caută camere active…',
          meta: 'Lista se actualizează automat imediat ce serverul răspunde.',
          badge: 'Sync',
          className: 'is-loading'
        }));
      } else if ((state === 'offline' || state === 'error') && rooms.length === 0) {
        list.append(createDuelStateItem(documentObject, {
          title: 'Camerele nu pot fi încărcate momentan',
          meta: 'Verifică legătura cu serverul; lista va fi reîncărcată automat.',
          badge: 'Offline',
          className: 'is-offline'
        }));
      } else if (rooms.length === 0) {
        list.append(createDuelStateItem(documentObject, {
          title: 'Nicio cameră activă',
          meta: 'Deschide Duel și creează primul lobby disponibil.',
          badge: 'Liber',
          className: 'is-empty'
        }));
      } else {
        for (const room of rooms.slice(0, DUEL_ROOM_PREVIEW_LIMIT)) {
          list.append(createDuelRoomPreviewItem(documentObject, room));
        }
        const remainingRooms = Math.max(0, normalizedPayload.totalRooms - DUEL_ROOM_PREVIEW_LIMIT);
        if (remainingRooms > 0) {
          list.append(createDuelStateItem(documentObject, {
            title: `+${remainingRooms} ${remainingRooms === 1 ? 'cameră disponibilă' : 'camere disponibile'}`,
            meta: 'Deschide Duel pentru lista completă și acțiunile de intrare.',
            badge: 'Vezi toate',
            className: 'is-more'
          }));
        }
      }
    }

    if (status) {
      if (state === 'offline') {
        status.textContent = rooms.length > 0
          ? 'Conexiunea a fost întreruptă. Sunt afișate ultimele camere primite.'
          : 'Conexiunea a fost întreruptă. Camerele nu sunt disponibile.';
      } else if (state === 'error') {
        status.textContent = 'Lista camerelor nu a putut fi încărcată.';
      } else if (state === 'loading') {
        status.textContent = 'Se încarcă lista camerelor Duel.';
      } else {
        status.textContent = normalizedPayload.totalRooms > 0
          ? `${normalizedPayload.totalRooms} camere Duel sunt active.`
          : 'Nu există camere Duel active.';
      }
    }

    return {
      ...normalizedPayload,
      activeMatches,
      participants,
      state
    };
  }

  function installGameHubDuelRoomSync({
    documentObject = globalObject?.document,
    windowObject = globalObject,
    socket = windowObject?.__f1GameSocket
  } = {}) {
    if (!documentObject) return null;

    let activeSocket = null;
    let latestPayload = { rooms: [], totalRooms: 0 };
    let hasReceivedPayload = false;

    function render(state = 'loading') {
      return renderDuelRoomSnapshot(documentObject, latestPayload, { state });
    }

    function requestRoomList() {
      if (!activeSocket || typeof activeSocket.emit !== 'function') return false;
      activeSocket.emit('requestRoomList');
      return true;
    }

    function handleRoomListUpdate(payload = {}) {
      latestPayload = payload;
      hasReceivedPayload = true;
      render('ready');
    }

    function handleConnect() {
      render(hasReceivedPayload ? 'ready' : 'loading');
      requestRoomList();
    }

    function handleDisconnect() {
      render('offline');
    }

    function handleConnectError() {
      render('error');
    }

    function detachSocket() {
      activeSocket?.off?.('roomListUpdate', handleRoomListUpdate);
      activeSocket?.off?.('connect', handleConnect);
      activeSocket?.off?.('disconnect', handleDisconnect);
      activeSocket?.off?.('connect_error', handleConnectError);
    }

    function attachSocket(nextSocket) {
      if (nextSocket === activeSocket) {
        requestRoomList();
        return activeSocket;
      }
      detachSocket();
      activeSocket = nextSocket || null;
      if (!activeSocket) {
        render(hasReceivedPayload ? 'offline' : 'loading');
        return null;
      }

      activeSocket.on?.('roomListUpdate', handleRoomListUpdate);
      activeSocket.on?.('connect', handleConnect);
      activeSocket.on?.('disconnect', handleDisconnect);
      activeSocket.on?.('connect_error', handleConnectError);
      render(hasReceivedPayload ? 'ready' : 'loading');
      requestRoomList();
      return activeSocket;
    }

    function handleSocketCreated(event) {
      attachSocket(event?.detail?.socket || windowObject?.__f1GameSocket || null);
    }

    windowObject?.addEventListener?.('f1:socket-created', handleSocketCreated);
    render('loading');
    attachSocket(socket);

    return {
      attachSocket,
      refresh: requestRoomList,
      render,
      disconnect() {
        detachSocket();
        activeSocket = null;
        windowObject?.removeEventListener?.('f1:socket-created', handleSocketCreated);
      }
    };
  }

  function appendTags(documentObject, variant, className = 'game-hub-card-tags') {
    const tags = createElement(documentObject, 'span', className);
    for (const tag of variant.tags || []) {
      tags.append(createElement(documentObject, 'span', 'game-hub-tag', tag));
    }
    return tags;
  }

  function applyModeCardAvailability(card, variant, runtimeSettings) {
    if (!card || !variant) return card;
    const runtimeEnabled = runtimeSettings?.isModeEnabled?.(variant.key) !== false;
    const available = variant.state === 'available' && runtimeEnabled;
    const state = card.querySelector?.('.game-hub-state');
    card.disabled = !available;
    card.classList.toggle('is-runtime-disabled', !runtimeEnabled);
    card.classList.toggle('is-coming-soon', runtimeEnabled && variant.state !== 'available');
    if (available) {
      card.removeAttribute?.('aria-disabled');
      card.title = '';
    } else {
      card.setAttribute('aria-disabled', 'true');
      card.title = runtimeEnabled
        ? `${variant.title} va fi disponibil într-un update viitor.`
        : `${variant.title} este temporar dezactivat.`;
    }
    if (state) {
      state.className = available ? 'game-hub-state is-available' : 'game-hub-state';
      state.textContent = available ? 'Disponibil' : (runtimeEnabled ? 'În curând' : 'Dezactivat');
    }
    return card;
  }

  function configureCard(card, variant) {
    card.type = 'button';
    card.dataset.gameVariant = variant.key;
    card.dataset.gameContext = variant.context;
    card.dataset.hubGroup = variant.hubGroup || '';
    if (variant.hubLayout) card.dataset.hubLayout = variant.hubLayout;
    if (variant.state !== 'available') return card;
    if (variant.modeChoice) {
      card.dataset.gameModeChoice = variant.modeChoice;
      card.setAttribute('aria-pressed', 'false');
    }
    if (typeof variant.pagePath === 'string') {
      card.dataset.gameModePage = variant.pagePath;
      card.setAttribute('aria-label', `${variant.title} · deschide pagina modului`);
    }
    return card;
  }

  function createModeCard(documentObject, variant, runtimeSettings) {
    const card = configureCard(
      createElement(documentObject, 'button', `game-mode-card game-hub-card game-hub-card--${variant.key}`),
      variant
    );
    const chrome = createElement(documentObject, 'span', 'game-hub-card-chrome');
    const topRow = createElement(documentObject, 'span', 'game-hub-card-top');
    const iconWrap = createElement(documentObject, 'span', 'game-hub-card-icon-wrap');
    iconWrap.append(createGameHubIcon(documentObject, variant.iconKey, 'mode-icon game-hub-svg-icon'));
    topRow.append(iconWrap, createElement(documentObject, 'span', 'game-hub-state'));

    const art = createElement(documentObject, 'span', 'game-hub-card-art');
    art.setAttribute('aria-hidden', 'true');
    const content = createElement(documentObject, 'span', 'game-hub-card-content');
    content.append(
      createElement(documentObject, 'strong', 'game-hub-card-title', variant.title),
      createElement(documentObject, 'small', 'game-hub-card-description', variant.description),
      appendTags(documentObject, variant)
    );
    chrome.append(topRow, art, content);
    card.append(chrome);
    return applyModeCardAvailability(card, variant, runtimeSettings);
  }

  function createPanel(documentObject, { title, description, iconKey, accentClass, bodyClass = '' }) {
    const panel = createElement(documentObject, 'section', `game-hub-panel ${accentClass} ${bodyClass}`.trim());
    const header = createElement(documentObject, 'div', `game-hub-panel-header ${accentClass}`.trim());
    const badge = createElement(documentObject, 'span', 'game-hub-panel-badge');
    badge.setAttribute('aria-hidden', 'true');
    badge.append(createGameHubIcon(documentObject, iconKey, 'game-hub-panel-icon game-hub-svg-icon'));
    const copy = createElement(documentObject, 'div', 'game-hub-panel-copy');
    copy.append(
      createElement(documentObject, 'h3', 'game-hub-panel-title', title),
      createElement(documentObject, 'p', 'game-hub-panel-description', description)
    );
    const accent = createElement(documentObject, 'span', 'game-hub-panel-accent');
    accent.setAttribute('aria-hidden', 'true');
    header.append(badge, copy, accent);
    panel.append(header);
    return panel;
  }

  function createGrid(documentObject, variants, runtimeSettings, className) {
    const grid = createElement(documentObject, 'div', className);
    grid.setAttribute('role', 'group');
    for (const variant of variants) {
      const card = createModeCard(documentObject, variant, runtimeSettings);
      if (variant.hubLayout === 'wide') card.classList.add('game-hub-card--wide');
      grid.append(card);
    }
    return grid;
  }

  function createDuelFeature(documentObject, value, label, valueId) {
    const tile = createElement(documentObject, 'span', 'game-hub-duel-feature');
    const valueElement = createElement(documentObject, 'strong', 'game-hub-duel-feature-value', value);
    if (valueId) valueElement.id = valueId;
    tile.append(
      valueElement,
      createElement(documentObject, 'small', 'game-hub-duel-feature-label', label)
    );
    return tile;
  }

  function createFeaturedDuelCard(documentObject, variant, runtimeSettings) {
    const card = configureCard(
      createElement(documentObject, 'button', `game-mode-card game-hub-featured-card game-hub-card--${variant.key}`),
      variant
    );
    card.id = 'gameHubDuelCard';
    const hero = createElement(documentObject, 'span', 'game-hub-featured-hero');
    hero.setAttribute('aria-hidden', 'true');
    const topBar = createElement(documentObject, 'span', 'game-hub-featured-top');
    topBar.append(
      createElement(documentObject, 'span', 'game-hub-featured-label', 'Multi-Player Duel'),
      createElement(documentObject, 'span', 'game-hub-state')
    );
    const features = createElement(documentObject, 'span', 'game-hub-duel-features');
    features.append(
      createDuelFeature(documentObject, '0', 'camere active', 'gameHubDuelActiveRooms'),
      createDuelFeature(documentObject, '0', 'meciuri live', 'gameHubDuelActiveMatches'),
      createDuelFeature(documentObject, '0', 'participanți conectați', 'gameHubDuelParticipants')
    );

    const rooms = createElement(documentObject, 'span', 'game-hub-duel-room-list');
    rooms.id = 'gameHubDuelRoomPreview';
    const roomListTitle = createElement(documentObject, 'span', 'game-hub-duel-room-list-title', 'Camere active (0)');
    roomListTitle.id = 'gameHubDuelRoomListTitle';
    const roomItems = createElement(documentObject, 'span', 'game-hub-duel-room-items');
    roomItems.id = 'gameHubDuelRoomItems';
    roomItems.append(createDuelStateItem(documentObject, {
      title: 'Se caută camere active…',
      meta: 'Lista se actualizează automat imediat ce serverul răspunde.',
      badge: 'Sync',
      className: 'is-loading'
    }));
    const roomStatus = createElement(documentObject, 'span', 'game-hub-duel-room-status', 'Se încarcă lista camerelor Duel.');
    roomStatus.id = 'gameHubDuelRoomStatus';
    roomStatus.setAttribute('role', 'status');
    roomStatus.setAttribute('aria-live', 'polite');
    roomStatus.setAttribute('aria-atomic', 'true');
    rooms.append(roomListTitle, roomItems, roomStatus);

    card.append(
      hero,
      topBar,
      createElement(documentObject, 'strong', 'game-hub-featured-title', variant.title.toUpperCase()),
      createElement(documentObject, 'span', 'game-hub-featured-description', 'Creează o cameră, invită un prieten și joacă în timp real fără să părăsești meniul principal.'),
      appendTags(documentObject, variant, 'game-hub-featured-tags'),
      features,
      (() => {
        const cta = createElement(documentObject, 'span', 'game-hub-featured-cta');
        cta.append(
          createElement(documentObject, 'span', 'game-hub-featured-cta-label', 'Deschide Duel'),
          createGameHubIcon(documentObject, 'arrow-right', 'game-hub-featured-cta-icon game-hub-svg-icon')
        );
        return cta;
      })(),
      rooms
    );
    return applyModeCardAvailability(card, variant, runtimeSettings);
  }

  function createProfileSummary(documentObject) {
    const item = createElement(documentObject, 'div', 'game-hub-summary-item game-hub-summary-profile is-guest');
    item.id = 'gameHubProfileSummary';

    const avatar = createElement(documentObject, 'span', 'game-hub-summary-avatar auth-avatar-visual');
    avatar.id = 'gameHubProfileAvatar';
    avatar.dataset.avatarKey = 'helmet-red';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.append(createElement(documentObject, 'span', 'auth-helmet-icon'));

    const copy = createElement(documentObject, 'div', 'game-hub-summary-profile-copy');
    const heading = createElement(documentObject, 'span', 'game-hub-summary-profile-heading');
    const username = createElement(documentObject, 'strong', 'game-hub-summary-username', 'Guest');
    username.id = 'gameHubProfileUsername';
    const level = createElement(documentObject, 'span', 'game-hub-summary-level', 'Nivel —');
    level.id = 'gameHubProfileLevel';
    heading.append(username, level);

    const progress = createElement(documentObject, 'span', 'game-hub-summary-progress');
    progress.id = 'gameHubProfileXpProgress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', 'Progres până la nivelul următor');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', '0');
    const progressBar = createElement(documentObject, 'span', 'game-hub-summary-progress-bar');
    progressBar.id = 'gameHubProfileXpBar';
    progress.append(progressBar);

    const xpText = createElement(documentObject, 'small', 'game-hub-summary-xp', 'Autentifică-te pentru progres');
    xpText.id = 'gameHubProfileXpText';
    const status = createElement(documentObject, 'span', 'game-hub-summary-status', 'Profil Guest');
    status.id = 'gameHubProfileStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    copy.append(heading, progress, xpText, status);
    item.append(avatar, copy);
    return item;
  }

  function createSummaryMetric(documentObject, { id, iconKey, label, value = '—', accentClass = '' }) {
    const item = createElement(documentObject, 'div', `game-hub-summary-item game-hub-summary-stat ${accentClass}`.trim());
    const iconElement = createElement(documentObject, 'span', 'game-hub-summary-icon');
    iconElement.setAttribute('aria-hidden', 'true');
    iconElement.append(createGameHubIcon(documentObject, iconKey, 'game-hub-summary-svg game-hub-svg-icon'));
    const copy = createElement(documentObject, 'span', 'game-hub-summary-stat-copy');
    const valueElement = createElement(documentObject, 'strong', 'game-hub-summary-value', String(value));
    valueElement.id = id;
    copy.append(
      createElement(documentObject, 'span', 'game-hub-summary-label', label),
      valueElement
    );
    item.append(iconElement, copy);
    return item;
  }

  function createDashboard(documentObject, registry, runtimeSettings) {
    const groups = registry.HUB_GROUPS;
    const singleVariants = registry.listGameVariantsByGroup(groups.SINGLE);
    const duelVariant = registry.listGameVariantsByGroup(groups.DUEL)[0];
    const specialtyVariants = registry.listGameVariantsByGroup(groups.SPECIALTY);
    const dashboard = createElement(documentObject, 'div', 'game-hub-dashboard');

    const singlePanel = createPanel(documentObject, {
      title: 'Single Player & Challenges',
      description: 'Classic, Daily și provocările oficiale într-o zonă separată.',
      iconKey: 'trophy', accentClass: 'game-hub-panel--single'
    });
    singlePanel.append(createGrid(documentObject, singleVariants, runtimeSettings, 'game-hub-card-grid game-hub-card-grid--single'));

    const duelPanel = createPanel(documentObject, {
      title: 'Duel',
      description: 'Modul central pentru sesiunile multiplayer și camerele live.',
      iconKey: 'swords', accentClass: 'game-hub-panel--duel', bodyClass: 'game-hub-panel--featured'
    });
    duelPanel.append(createFeaturedDuelCard(documentObject, duelVariant, runtimeSettings));

    const specialtyPanel = createPanel(documentObject, {
      title: 'Specialty Guesser Modes',
      description: 'Modurile rapide și experimentele competitive pe care le-ai adăugat recent.',
      iconKey: 'sparkles', accentClass: 'game-hub-panel--specialty'
    });
    specialtyPanel.append(createGrid(documentObject, specialtyVariants, runtimeSettings, 'game-hub-card-grid game-hub-card-grid--specialty'));
    dashboard.append(singlePanel, duelPanel, specialtyPanel);

    const summary = createElement(documentObject, 'div', 'game-hub-summary-bar');
    summary.setAttribute('aria-label', 'Progresul și statisticile contului');
    summary.append(
      createProfileSummary(documentObject),
      createSummaryMetric(documentObject, {
        id: 'gameHubProfileVictories', iconKey: 'trophy', label: 'Victorii', accentClass: 'game-hub-summary-item--single'
      }),
      createSummaryMetric(documentObject, {
        id: 'gameHubProfileAccuracy', iconKey: 'target', label: 'Acuratețe', accentClass: 'game-hub-summary-item--single'
      }),
      createSummaryMetric(documentObject, {
        id: 'gameHubProfileActiveDays', iconKey: 'calendar', label: 'Zile active', accentClass: 'game-hub-summary-item--specialty'
      }),
      createSummaryMetric(documentObject, {
        id: 'gameHubProfilePlayed', iconKey: 'grid', label: 'Meciuri jucate', accentClass: 'game-hub-summary-item--duel'
      })
    );

    const shell = createElement(documentObject, 'div', 'game-hub-dashboard-shell');
    shell.append(dashboard, summary);
    return shell;
  }

  const api = Object.freeze({
    applyModeCardAvailability,
    createDashboard,
    createGameHubIcon,
    createFeaturedDuelCard,
    createModeCard,
    ensureHeaderProfileMarkup,
    getActiveStreak,
    installGameHubDuelRoomSync,
    installGameHubProfileSync,
    normalizeAvatarKey,
    normalizeDuelRoomListPayload,
    renderDuelRoomSnapshot,
    renderProfileSnapshot,
    setProgressPercent
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) {
    globalObject.F1GameHubDashboardView = api;
    if (globalObject.document) {
      globalObject.setTimeout?.(() => installGameHubProfileSync(), 0);
    }
  }
}(typeof globalThis !== 'undefined' ? globalThis : null));
