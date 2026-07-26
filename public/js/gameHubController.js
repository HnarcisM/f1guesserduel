(function installGameHubModule(globalObject) {
    'use strict';

    function createElement(documentObject, tagName, className = '', text = '') {
        const element = documentObject.createElement(tagName);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function createTag(documentObject, text) {
        return createElement(documentObject, 'span', 'game-hub-tag', text);
    }

    function findDescendantByClass(root, className) {
        if (!root) return null;
        if (root.classList?.contains?.(className)) return root;
        for (const child of Array.from(root.children || [])) {
            const match = findDescendantByClass(child, className);
            if (match) return match;
        }
        return null;
    }

    function applyModeCardAvailability(card, variant, runtimeSettings = null) {
        if (!card || !variant) return card;
        const runtimeEnabled = runtimeSettings?.isModeEnabled?.(variant.key) !== false;
        const available = variant.state === 'available' && runtimeEnabled;
        const state = findDescendantByClass(card, 'game-hub-state');

        card.disabled = !available;
        card.classList.toggle('is-runtime-disabled', !runtimeEnabled);
        card.classList.toggle('is-coming-soon', runtimeEnabled && variant.state !== 'available');

        if (available) {
            card.removeAttribute?.('aria-disabled');
            card.title = '';
            if (state) {
                state.className = 'game-hub-state is-available';
                state.textContent = 'Disponibil';
            }
            return card;
        }

        card.setAttribute('aria-disabled', 'true');
        card.title = runtimeEnabled
            ? `${variant.title} va fi disponibil într-un update viitor.`
            : `${variant.title} este temporar dezactivat.`;
        if (state) {
            state.className = 'game-hub-state';
            state.textContent = runtimeEnabled ? 'În curând' : 'Dezactivat';
        }
        return card;
    }

    function createModeCard(documentObject, variant, runtimeSettings = null) {
        const isPageLink = variant.state === 'available' && typeof variant.pagePath === 'string';
        const card = createElement(documentObject, 'button', 'game-mode-card game-hub-card');
        card.type = 'button';
        card.dataset.gameVariant = variant.key;
        card.dataset.gameContext = variant.context;

        if (variant.state === 'available') {
            if (variant.modeChoice) {
                card.dataset.gameModeChoice = variant.modeChoice;
                card.setAttribute('aria-pressed', 'false');
            }
            if (isPageLink) {
                card.dataset.gameModePage = variant.pagePath;
                card.setAttribute('aria-label', `${variant.title} · deschide pagina modului`);
            }
        }

        const topRow = createElement(documentObject, 'span', 'game-hub-card-top');
        const icon = createElement(documentObject, 'span', 'mode-icon', variant.icon);
        icon.setAttribute('aria-hidden', 'true');
        topRow.append(icon);
        topRow.append(createElement(documentObject, 'span', 'game-hub-state'));

        const title = createElement(documentObject, 'strong', 'game-hub-card-title', variant.title);
        const description = createElement(documentObject, 'small', 'game-hub-card-description', variant.description);
        const tags = createElement(documentObject, 'span', 'game-hub-card-tags');
        for (const tag of variant.tags || []) tags.append(createTag(documentObject, tag));

        card.append(topRow, title, description, tags);
        return applyModeCardAvailability(card, variant, runtimeSettings);
    }

    function createSection(documentObject, {
        title,
        description,
        variants,
        modifier = '',
        runtimeSettings = null
    }) {
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

    function collectModeCards(root) {
        const cards = [];
        function visit(element) {
            if (!element) return;
            if (element.dataset?.gameVariant) cards.push(element);
            for (const child of Array.from(element.children || [])) visit(child);
        }
        visit(root);
        return cards;
    }

    function syncRuntimeModeCards(root, registry, runtimeSettings = null) {
        for (const card of collectModeCards(root)) {
            const variant = registry?.getGameVariant?.(card.dataset.gameVariant);
            if (variant) applyModeCardAvailability(card, variant, runtimeSettings);
        }
        return root;
    }

    function createGameHubController({
        documentObject = globalObject?.document,
        registry = globalObject?.F1GameVariantRegistry,
        rootId = 'gameModeHub',
        windowObject = globalObject
    } = {}) {
        let clickInstalled = false;

        function handleClick(event) {
            const card = event?.target?.closest?.('[data-game-mode-page]')
                || (event?.target?.dataset?.gameModePage ? event.target : null);
            if (!card || card.disabled) return;
            const pagePath = card.dataset.gameModePage;
            if (typeof pagePath !== 'string' || !pagePath.startsWith('/modes/')) return;
            windowObject?.location?.assign?.(pagePath);
        }

        function installClickHandler(root) {
            if (clickInstalled || typeof root?.addEventListener !== 'function') return;
            root.addEventListener('click', handleClick);
            clickInstalled = true;
        }

        function render() {
            const root = documentObject?.getElementById?.(rootId);
            if (!root || !registry) return false;

            const runtimeSettings = windowObject?.F1RuntimeSettings || globalObject?.F1RuntimeSettings || null;
            if (root.dataset.gameHubReady === 'true') {
                syncRuntimeModeCards(root, registry, runtimeSettings);
                return true;
            }

            const available = registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.AVAILABLE);
            const comingSoon = registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.COMING_SOON);
            const sections = [
                createSection(documentObject, {
                    title: 'Joacă acum',
                    description: 'Alege experiența pe care vrei să o pornești.',
                    variants: available,
                    modifier: 'game-hub-section--available',
                    runtimeSettings
                })
            ];
            if (comingSoon.length > 0) {
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

        const controller = createGameHubController({
            documentObject: windowObject.document,
            registry: windowObject.F1GameVariantRegistry,
            windowObject
        });
        const render = () => controller.render();
        windowObject.document.addEventListener?.('f1:runtime-settings', render);

        if (!render()) {
            windowObject.document.addEventListener?.('DOMContentLoaded', render, { once: true });
        }
        windowObject.__f1GameHubController = controller;
        return controller;
    }

    const api = Object.freeze({
        applyModeCardAvailability,
        createGameHubController,
        createModeCard,
        installGameHubController,
        syncRuntimeModeCards
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (globalObject) {
        globalObject.F1GameHub = api;
        if (globalObject.document) installGameHubController(globalObject);
    }
}(typeof globalThis !== 'undefined' ? globalThis : null));
