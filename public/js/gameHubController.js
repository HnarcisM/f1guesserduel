(function installGameHubModule(globalObject) {
  'use strict';
  function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
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
    const card = createElement(documentObject, 'button', 'game-mode-card game-hub-card');
    card.type = 'button';
    card.dataset.gameVariant = variant.key;
    card.dataset.gameContext = variant.context;
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
    const topRow = createElement(documentObject, 'span', 'game-hub-card-top');
    const icon = createElement(documentObject, 'span', 'mode-icon', variant.icon);
    icon.setAttribute('aria-hidden', 'true');
    topRow.append(icon, createElement(documentObject, 'span', 'game-hub-state'));
    const tags = createElement(documentObject, 'span', 'game-hub-card-tags');
    for (const tag of variant.tags || []) {
      tags.append(createElement(documentObject, 'span', 'game-hub-tag', tag));
    }
    card.append(
      topRow,
      createElement(documentObject, 'strong', 'game-hub-card-title', variant.title),
      createElement(documentObject, 'small', 'game-hub-card-description', variant.description),
      tags
    );
    return applyModeCardAvailability(card, variant, runtimeSettings);
  }
  function createSection(documentObject, { title, description, variants, modifier = '', runtimeSettings }) {
    const section = createElement(documentObject, 'section', `game-hub-section ${modifier}`.trim());
    const header = createElement(documentObject, 'div', 'game-hub-section-header');
    const copy = createElement(documentObject, 'div', 'game-hub-section-copy');
    copy.append(
      createElement(documentObject, 'h3', '', title),
      createElement(documentObject, 'p', '', description)
    );
    header.append(copy);
    const grid = createElement(documentObject, 'div', 'game-hub-grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', title);
    for (const variant of variants) grid.append(createModeCard(documentObject, variant, runtimeSettings));
    section.append(header, grid);
    return section;
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
      const runtimeSettings=windowObject?.F1RuntimeSettings;
      if (root.dataset.gameHubReady === 'true') {
        syncRuntimeModeCards(root, registry, runtimeSettings);
        return true;
      }
      const states = registry.GAME_VARIANT_STATES;
      const sections = [createSection(documentObject, {
        title: 'Joacă acum',
        description: 'Alege experiența pe care vrei să o pornești.',
        variants: registry.listGameVariantsByState(states.AVAILABLE),
        modifier: 'game-hub-section--available',
        runtimeSettings
      })];
      const comingSoon = registry.listGameVariantsByState(states.COMING_SOON);
      if (comingSoon.length) {
        sections.push(createSection(documentObject, {
          title: 'În dezvoltare',
          description: 'Următoarele moduri vor fi activate treptat în update-urile viitoare.',
          variants: comingSoon,
          modifier: 'game-hub-section--upcoming',
          runtimeSettings
        }));
      }
      root.replaceChildren(...sections);
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
  const api = Object.freeze({ createGameHubController, createModeCard, installGameHubController });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) {
    globalObject.F1GameHub = api;
    if (globalObject.document) installGameHubController(globalObject);
  }
}(typeof globalThis !== 'undefined' ? globalThis : null));
