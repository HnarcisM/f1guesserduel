(function installGameHubDashboardView(globalObject) {
  'use strict';

  function resolveDependency(globalName, modulePath) {
    if (globalObject?.[globalName]) return globalObject[globalName];
    if (typeof module !== 'undefined' && module.exports) return require(modulePath);
    return null;
  }

  const core = resolveDependency('F1GameHubViewCore', './gameHubViewCore.js');
  const profileView = resolveDependency('F1GameHubProfileView', './gameHubProfileView.js');
  const duelRoomView = resolveDependency('F1GameHubDuelRoomView', './gameHubDuelRoomView.js');
  const cardsView = resolveDependency('F1GameHubCardsView', './gameHubCardsView.js');
  if (!core || !profileView || !duelRoomView || !cardsView) {
    throw new Error('Game Hub dashboard dependencies are not available.');
  }

  const { createElement, createGameHubIcon, getActiveStreak, normalizeAvatarKey, setProgressPercent } = core;
  const { ensureHeaderProfileMarkup, installGameHubProfileSync, renderProfileSnapshot } = profileView;
  const { installGameHubDuelRoomSync, normalizeDuelRoomListPayload, renderDuelRoomSnapshot } = duelRoomView;
  const {
    applyModeCardAvailability,
    createFeaturedDuelCard,
    createGrid,
    createModeCard,
    createPanel,
    createProfileSummary,
    createSummaryMetric
  } = cardsView;

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
      iconKey: 'duel-helmets', accentClass: 'game-hub-panel--duel', bodyClass: 'game-hub-panel--featured'
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
