(function installGameHubModule(globalObject) {
  'use strict';

  function getDashboardView() {
    if (globalObject?.F1GameHubDashboardView) return globalObject.F1GameHubDashboardView;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('./gameHubDashboardView.js');
    }
    return null;
  }

  function createModeCard(documentObject, variant, runtimeSettings) {
    return getDashboardView()?.createModeCard?.(documentObject, variant, runtimeSettings) || null;
  }

  function createFeaturedDuelCard(documentObject, variant, runtimeSettings) {
    return getDashboardView()?.createFeaturedDuelCard?.(documentObject, variant, runtimeSettings) || null;
  }

  function syncRuntimeModeCards(root, registry, runtimeSettings) {
    const view = getDashboardView();
    const cards = root?.querySelectorAll?.('[data-game-variant]') || [];
    for (const card of cards) {
      const variant = registry?.getGameVariant?.(card.dataset.gameVariant);
      if (variant) view?.applyModeCardAvailability?.(card, variant, runtimeSettings);
    }
  }

  function createGameHubController({
    documentObject = globalObject?.document,
    registry = globalObject?.F1GameVariantRegistry,
    rootId = 'gameModeHub',
    windowObject = globalObject
  } = {}) {
    let clickInstalled = false;

    function handleClick(event) {
      const gameModeChoice = event?.target?.closest?.('[data-game-mode-choice]');
      if (gameModeChoice) return;
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
      const view = getDashboardView();
      if (!root || !registry || !view) return false;
      const runtimeSettings = windowObject?.F1RuntimeSettings;
      if (root.dataset.gameHubReady === 'true') {
        syncRuntimeModeCards(root, registry, runtimeSettings);
        return true;
      }
      if (!registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.AVAILABLE).length) return false;
      root.replaceChildren(view.createDashboard(documentObject, registry, runtimeSettings));
      root.dataset.gameHubReady = 'true';
      installClickHandler(root);
      return true;
    }

    return { handleClick, render };
  }

  function installGameHubController(windowObject = globalObject) {
    if (!windowObject?.document || !windowObject.F1GameVariantRegistry || !getDashboardView()) return null;
    if (windowObject.__f1GameHubController) return windowObject.__f1GameHubController;
    const controller = createGameHubController({
      documentObject: windowObject.document,
      registry: windowObject.F1GameVariantRegistry,
      windowObject
    });
    const render = () => controller.render();
    windowObject.document.addEventListener?.('f1:runtime-settings', render);
    if (!render()) windowObject.document.addEventListener?.('DOMContentLoaded', render, { once: true });
    windowObject.__f1GameHubController = controller;
    return controller;
  }

  const api = Object.freeze({
    createFeaturedDuelCard,
    createGameHubController,
    createModeCard,
    installGameHubController
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalObject) {
    globalObject.F1GameHub = api;
    if (globalObject.document) installGameHubController(globalObject);
  }
}(typeof globalThis !== 'undefined' ? globalThis : null));
