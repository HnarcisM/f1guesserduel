(function installGameHubModule(globalObject) {
  'use strict';

  function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function appendTags(documentObject, variant, containerClass = 'game-hub-card-tags') {
    const tags = createElement(documentObject, 'span', containerClass);
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

  function createModeCard(documentObject, variant, runtimeSettings) {
    const card = createElement(documentObject, 'button', `game-mode-card game-hub-card game-hub-card--${variant.key}`);
    card.type = 'button';
    card.dataset.gameVariant = variant.key;
    card.dataset.gameContext = variant.context;
    card.dataset.hubGroup = variant.hubGroup || '';
    if (variant.hubLayout) card.dataset.hubLayout = variant.hubLayout;
    if (variant.state === 'available') {
      if (variant.modeChoice) {
        card.dataset.gameModeChoice = variant.modeChoice;
        card.setAttribute('aria-pressed', 'false');
      }
      if (typeof variant.pagePath === 'string') {
        card.dataset.gameModePage = variant.pagePath;
        card.setAttribute('aria-label', `${variant.title} · deschide pagina modului`);
      }
    }

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

  function createPanelHeader(documentObject, { title, description, icon, accentClass }) {
    const header = createElement(documentObject, `div`, `game-hub-panel-header ${accentClass}`.trim());
    const badge = createElement(documentObject, 'span', 'game-hub-panel-badge');
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = icon;
    const copy = createElement(documentObject, 'div', 'game-hub-panel-copy');
    copy.append(
      createElement(documentObject, 'h3', 'game-hub-panel-title', title),
      createElement(documentObject, 'p', 'game-hub-panel-description', description)
    );
    const accent = createElement(documentObject, 'span', 'game-hub-panel-accent');
    accent.setAttribute('aria-hidden', 'true');
    header.append(badge, copy, accent);
    return header;
  }

  function createPanel(documentObject, { title, description, icon, accentClass, bodyClass = '' }) {
    const panel = createElement(documentObject, `section`, `game-hub-panel ${accentClass} ${bodyClass}`.trim());
    panel.append(createPanelHeader(documentObject, { title, description, icon, accentClass }));
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
    const live = createElement(documentObject, 'span', 'game-hub-duel-room-live', 'Live');
    item.append(copy, live);
    return item;
  }

  function createFeaturedDuelCard(documentObject, variant, runtimeSettings) {
    const card = createElement(documentObject, 'button', `game-mode-card game-hub-featured-card game-hub-card--${variant.key}`);
    card.type = 'button';
    card.dataset.gameVariant = variant.key;
    card.dataset.gameContext = variant.context;
    card.dataset.hubGroup = variant.hubGroup || '';
    if (variant.state === 'available') {
      if (variant.modeChoice) {
        card.dataset.gameModeChoice = variant.modeChoice;
        card.setAttribute('aria-pressed', 'false');
      }
    }

    const hero = createElement(documentObject, 'span', 'game-hub-featured-hero');
    hero.setAttribute('aria-hidden', 'true');
    const topBar = createElement(documentObject, 'span', 'game-hub-featured-top');
    const label = createElement(documentObject, 'span', 'game-hub-featured-label', 'Multi-Player Duel');
    const state = createElement(documentObject, 'span', 'game-hub-state');
    topBar.append(label, state);
    const title = createElement(documentObject, 'strong', 'game-hub-featured-title', variant.title.toUpperCase());
    const description = createElement(documentObject, 'span', 'game-hub-featured-description', 'Creează o cameră, invită un prieten și joacă în timp real fără să părăsești meniul principal.');
    const tagRow = appendTags(documentObject, variant, 'game-hub-featured-tags');
    const featureRow = createElement(documentObject, 'span', 'game-hub-duel-features');
    featureRow.append(
      createDuelFeature(documentObject, 'Camere', 'private sau publice'),
      createDuelFeature(documentObject, 'Best Of', '3, 5 sau 7 runde'),
      createDuelFeature(documentObject, 'Live', 'istoric și spectatori')
    );
    const cta = createElement(documentObject, 'span', 'game-hub-featured-cta', 'Deschide Duel');
    const rooms = createElement(documentObject, 'span', 'game-hub-duel-room-list');
    rooms.append(
      createElement(documentObject, 'span', 'game-hub-duel-room-list-title', 'Ce poți face în Duel'),
      createDuelListItem(documentObject, 'Intră într-o cameră activă', 'Vezi camerele disponibile și alege una existentă.'),
      createDuelListItem(documentObject, 'Creează propriul lobby', 'Partajează codul și configurează seria exact cum vrei.'),
      createDuelListItem(documentObject, 'Urmărește progresul live', 'Scor, istoric pe runde și stare adversar în timp real.')
    );

    card.append(hero, topBar, title, description, tagRow, featureRow, cta, rooms);
    return applyModeCardAvailability(card, variant, runtimeSettings);
  }

  function createSummaryMetric(documentObject, label, value, accentClass) {
    const item = createElement(documentObject, `div`, `game-hub-summary-item ${accentClass}`.trim());
    item.append(
      createElement(documentObject, 'span', 'game-hub-summary-label', label),
      createElement(documentObject, 'strong', 'game-hub-summary-value', String(value))
    );
    return item;
  }

  function createDashboard(documentObject, registry, runtimeSettings) {
    const wrapper = createElement(documentObject, 'div', 'game-hub-dashboard');
    const groups = registry.HUB_GROUPS;
    const singleVariants = registry.listGameVariantsByGroup(groups.SINGLE);
    const duelVariant = registry.listGameVariantsByGroup(groups.DUEL)[0];
    const specialtyVariants = registry.listGameVariantsByGroup(groups.SPECIALTY);

    const singlePanel = createPanel(documentObject, {
      title: 'Single Player & Challenges',
      description: 'Classic, Daily și provocările oficiale într-o zonă separată.',
      icon: '🏆',
      accentClass: 'game-hub-panel--single'
    });
    singlePanel.append(createGrid(documentObject, singleVariants, runtimeSettings, 'game-hub-card-grid game-hub-card-grid--single'));

    const duelPanel = createPanel(documentObject, {
      title: 'Duel',
      description: 'Modul central pentru sesiunile multiplayer și camerele live.',
      icon: '⚔️',
      accentClass: 'game-hub-panel--duel',
      bodyClass: 'game-hub-panel--featured'
    });
    duelPanel.append(createFeaturedDuelCard(documentObject, duelVariant, runtimeSettings));

    const specialtyPanel = createPanel(documentObject, {
      title: 'Specialty Guesser Modes',
      description: 'Modurile rapide și experimentele competitive pe care le-ai adăugat recent.',
      icon: '⭐',
      accentClass: 'game-hub-panel--specialty'
    });
    specialtyPanel.append(createGrid(documentObject, specialtyVariants, runtimeSettings, 'game-hub-card-grid game-hub-card-grid--specialty'));

    wrapper.append(singlePanel, duelPanel, specialtyPanel);

    const summary = createElement(documentObject, 'div', 'game-hub-summary-bar');
    summary.append(
      createSummaryMetric(documentObject, 'Moduri disponibile', registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.AVAILABLE).length, 'game-hub-summary-item--single'),
      createSummaryMetric(documentObject, 'Single & Challenges', singleVariants.length, 'game-hub-summary-item--single'),
      createSummaryMetric(documentObject, 'Specialty modes', specialtyVariants.length, 'game-hub-summary-item--specialty'),
      createSummaryMetric(documentObject, 'Pagini dedicate', registry.listGameVariants().filter(variant => typeof variant.pagePath === 'string').length, 'game-hub-summary-item--duel'),
      createSummaryMetric(documentObject, 'Necesită cont', registry.listGameVariants().filter(variant => variant.requiresAccount).length, 'game-hub-summary-item--specialty')
    );

    const shell = createElement(documentObject, 'div', 'game-hub-dashboard-shell');
    shell.append(wrapper, summary);
    return shell;
  }

  function syncRuntimeModeCards(root, registry, runtimeSettings) {
    const cards = root?.querySelectorAll?.('[data-game-variant]') || [];
    for (const card of cards) {
      const variant = registry?.getGameVariant?.(card.dataset.gameVariant);
      if (variant) applyModeCardAvailability(card, variant, runtimeSettings);
    }
  }

  function createGameHubController({ documentObject = globalObject?.document, registry = globalObject?.F1GameVariantRegistry, rootId = 'gameModeHub', windowObject = globalObject } = {}) {
    let clickInstalled = false;
    function handleClick(event) {
      const card = event?.target?.closest?.('[data-game-mode-page]')
        || (event?.target?.dataset?.gameModePage ? event.target : null);
      if (!card || card.disabled) return;
      const pagePath = card.dataset.gameModePage;
      if (typeof pagePath === 'string' && pagePath.startsWith('/modes/')) {
        windowObject?.location?.assign?.(pagePath);
      }
    }
    function installClickHandler(root) {
      if (clickInstalled || typeof root?.addEventListener !== 'function') return;
      root.addEventListener('click', handleClick);
      clickInstalled = true;
    }
    function render() {
      const root = documentObject?.getElementById?.(rootId);
      if (!root || !registry) return false;
      const runtimeSettings = windowObject?.F1RuntimeSettings;
      if (root.dataset.gameHubReady === 'true') {
        syncRuntimeModeCards(root, registry, runtimeSettings);
        return true;
      }
      const states = registry.GAME_VARIANT_STATES;
      const available = registry.listGameVariantsByState(states.AVAILABLE);
      if (!available.length) return false;
      root.replaceChildren(createDashboard(documentObject, registry, runtimeSettings));
      root.dataset.gameHubReady = 'true';
      installClickHandler(root);
      return true;
    }
    return { handleClick, render };
  }

  function installGameHubController(windowObject = globalObject) {
    if (!windowObject?.document || !windowObject.F1GameVariantRegistry) return null;
    if (windowObject.__f1GameHubController) return windowObject.__f1GameHubController;
    const controller = createGameHubController({ documentObject: windowObject.document, registry: windowObject.F1GameVariantRegistry, windowObject });
    const render = () => controller.render();
    windowObject.document.addEventListener?.('f1:runtime-settings', render);
    if (!render()) windowObject.document.addEventListener?.('DOMContentLoaded', render, { once: true });
    windowObject.__f1GameHubController = controller;
    return controller;
  }

  const api = Object.freeze({
    createGameHubController,
    createModeCard,
    createFeaturedDuelCard,
    installGameHubController
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) {
    globalObject.F1GameHub = api;
    if (globalObject.document) installGameHubController(globalObject);
  }
}(typeof globalThis !== 'undefined' ? globalThis : null));
