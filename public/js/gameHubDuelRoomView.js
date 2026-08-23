(function installGameHubDuelRoomView(globalObject) {
  'use strict';

  function resolveCore() {
    if (globalObject?.F1GameHubViewCore) return globalObject.F1GameHubViewCore;
    if (typeof module !== 'undefined' && module.exports) return require('./gameHubViewCore.js');
    return null;
  }

  const core = resolveCore();
  if (!core) throw new Error('Game Hub Duel room view requires F1GameHubViewCore.');
  const { asNonNegativeInteger, createElement, normalizeAvatarKey } = core;
  const DUEL_ROOM_PREVIEW_LIMIT = 3;

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


  const api = Object.freeze({
    createDuelStateItem,
    installGameHubDuelRoomSync,
    normalizeDuelRoomListPayload,
    renderDuelRoomSnapshot
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) globalObject.F1GameHubDuelRoomView = api;
}(typeof globalThis !== 'undefined' ? globalThis : null));
