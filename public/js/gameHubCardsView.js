(function installGameHubCardsView(globalObject) {
  'use strict';

  function resolveDependency(globalName, modulePath) {
    if (globalObject?.[globalName]) return globalObject[globalName];
    if (typeof module !== 'undefined' && module.exports) return require(modulePath);
    return null;
  }

  const core = resolveDependency('F1GameHubViewCore', './gameHubViewCore.js');
  const duelRoomView = resolveDependency('F1GameHubDuelRoomView', './gameHubDuelRoomView.js');
  if (!core || !duelRoomView) {
    throw new Error('Game Hub cards view requires core and Duel room view modules.');
  }
  const { createElement, createGameHubIcon } = core;
  const { createDuelStateItem } = duelRoomView;

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
    const header = createElement(documentObject, 'div', 'game-hub-panel-header');
    const heading = createElement(documentObject, 'div', 'game-hub-panel-heading');
    const copy = createElement(documentObject, 'div', 'game-hub-panel-copy');
    copy.append(
      createElement(documentObject, 'h3', 'game-hub-panel-title', title),
      createElement(documentObject, 'p', 'game-hub-panel-description', description)
    );
    heading.append(
      createGameHubIcon(documentObject, iconKey, 'game-hub-panel-icon game-hub-svg-icon'),
      copy
    );
    const accent = createElement(documentObject, 'span', 'game-hub-panel-accent');
    accent.setAttribute('aria-hidden', 'true');
    header.append(heading, accent);
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


  const api = Object.freeze({
    applyModeCardAvailability,
    createFeaturedDuelCard,
    createGrid,
    createModeCard,
    createPanel,
    createProfileSummary,
    createSummaryMetric
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) globalObject.F1GameHubCardsView = api;
}(typeof globalThis !== 'undefined' ? globalThis : null));
