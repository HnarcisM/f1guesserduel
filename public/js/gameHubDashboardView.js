(function installGameHubDashboardView(globalObject) {
  'use strict';

  function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
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
    const icon = createElement(documentObject, 'span', 'mode-icon', variant.icon);
    icon.setAttribute('aria-hidden', 'true');
    iconWrap.append(icon);
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

  function createPanel(documentObject, { title, description, icon, accentClass, bodyClass = '' }) {
    const panel = createElement(documentObject, 'section', `game-hub-panel ${accentClass} ${bodyClass}`.trim());
    const header = createElement(documentObject, 'div', `game-hub-panel-header ${accentClass}`.trim());
    const badge = createElement(documentObject, 'span', 'game-hub-panel-badge', icon);
    badge.setAttribute('aria-hidden', 'true');
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

  function createDuelFeature(documentObject, value, label) {
    const tile = createElement(documentObject, 'span', 'game-hub-duel-feature');
    tile.append(
      createElement(documentObject, 'strong', 'game-hub-duel-feature-value', value),
      createElement(documentObject, 'small', 'game-hub-duel-feature-label', label)
    );
    return tile;
  }

  function createDuelListItem(documentObject, title, meta) {
    const item = createElement(documentObject, 'span', 'game-hub-duel-room-item');
    const copy = createElement(documentObject, 'span', 'game-hub-duel-room-copy');
    copy.append(
      createElement(documentObject, 'strong', 'game-hub-duel-room-title', title),
      createElement(documentObject, 'small', 'game-hub-duel-room-meta', meta)
    );
    item.append(copy, createElement(documentObject, 'span', 'game-hub-duel-room-live', 'Live'));
    return item;
  }

  function createFeaturedDuelCard(documentObject, variant, runtimeSettings) {
    const card = configureCard(
      createElement(documentObject, 'button', `game-mode-card game-hub-featured-card game-hub-card--${variant.key}`),
      variant
    );
    const hero = createElement(documentObject, 'span', 'game-hub-featured-hero');
    hero.setAttribute('aria-hidden', 'true');
    const topBar = createElement(documentObject, 'span', 'game-hub-featured-top');
    topBar.append(
      createElement(documentObject, 'span', 'game-hub-featured-label', 'Multi-Player Duel'),
      createElement(documentObject, 'span', 'game-hub-state')
    );
    const features = createElement(documentObject, 'span', 'game-hub-duel-features');
    features.append(
      createDuelFeature(documentObject, 'Camere', 'private sau publice'),
      createDuelFeature(documentObject, 'Best Of', '3, 5 sau 7 runde'),
      createDuelFeature(documentObject, 'Live', 'istoric și spectatori')
    );
    const rooms = createElement(documentObject, 'span', 'game-hub-duel-room-list');
    rooms.append(
      createElement(documentObject, 'span', 'game-hub-duel-room-list-title', 'Ce poți face în Duel'),
      createDuelListItem(documentObject, 'Intră într-o cameră activă', 'Vezi camerele disponibile și alege una existentă.'),
      createDuelListItem(documentObject, 'Creează propriul lobby', 'Partajează codul și configurează seria exact cum vrei.'),
      createDuelListItem(documentObject, 'Urmărește progresul live', 'Scor, istoric pe runde și stare adversar în timp real.')
    );
    card.append(
      hero,
      topBar,
      createElement(documentObject, 'strong', 'game-hub-featured-title', variant.title.toUpperCase()),
      createElement(documentObject, 'span', 'game-hub-featured-description', 'Creează o cameră, invită un prieten și joacă în timp real fără să părăsești meniul principal.'),
      appendTags(documentObject, variant, 'game-hub-featured-tags'),
      features,
      createElement(documentObject, 'span', 'game-hub-featured-cta', 'Deschide Duel'),
      rooms
    );
    return applyModeCardAvailability(card, variant, runtimeSettings);
  }

  function createSummaryMetric(documentObject, label, value, accentClass) {
    const item = createElement(documentObject, 'div', `game-hub-summary-item ${accentClass}`.trim());
    item.append(
      createElement(documentObject, 'span', 'game-hub-summary-label', label),
      createElement(documentObject, 'strong', 'game-hub-summary-value', String(value))
    );
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
      icon: '🏆', accentClass: 'game-hub-panel--single'
    });
    singlePanel.append(createGrid(documentObject, singleVariants, runtimeSettings, 'game-hub-card-grid game-hub-card-grid--single'));

    const duelPanel = createPanel(documentObject, {
      title: 'Duel',
      description: 'Modul central pentru sesiunile multiplayer și camerele live.',
      icon: '⚔️', accentClass: 'game-hub-panel--duel', bodyClass: 'game-hub-panel--featured'
    });
    duelPanel.append(createFeaturedDuelCard(documentObject, duelVariant, runtimeSettings));

    const specialtyPanel = createPanel(documentObject, {
      title: 'Specialty Guesser Modes',
      description: 'Modurile rapide și experimentele competitive pe care le-ai adăugat recent.',
      icon: '⭐', accentClass: 'game-hub-panel--specialty'
    });
    specialtyPanel.append(createGrid(documentObject, specialtyVariants, runtimeSettings, 'game-hub-card-grid game-hub-card-grid--specialty'));
    dashboard.append(singlePanel, duelPanel, specialtyPanel);

    const summary = createElement(documentObject, 'div', 'game-hub-summary-bar');
    summary.append(
      createSummaryMetric(documentObject, 'Moduri disponibile', registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.AVAILABLE).length, 'game-hub-summary-item--single'),
      createSummaryMetric(documentObject, 'Single & Challenges', singleVariants.length, 'game-hub-summary-item--single'),
      createSummaryMetric(documentObject, 'Specialty modes', specialtyVariants.length, 'game-hub-summary-item--specialty'),
      createSummaryMetric(documentObject, 'Pagini dedicate', registry.listGameVariants().filter(variant => typeof variant.pagePath === 'string').length, 'game-hub-summary-item--duel'),
      createSummaryMetric(documentObject, 'Necesită cont', registry.listGameVariants().filter(variant => variant.requiresAccount).length, 'game-hub-summary-item--specialty')
    );

    const shell = createElement(documentObject, 'div', 'game-hub-dashboard-shell');
    shell.append(dashboard, summary);
    return shell;
  }

  const api = Object.freeze({
    applyModeCardAvailability,
    createDashboard,
    createFeaturedDuelCard,
    createModeCard
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) globalObject.F1GameHubDashboardView = api;
}(typeof globalThis !== 'undefined' ? globalThis : null));
