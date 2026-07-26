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

    function createModeCard(documentObject, variant, runtimeSettings = null) {
        const runtimeEnabled = runtimeSettings?.isModeEnabled?.(variant.key) !== false;
        const available = variant.state === 'available' && runtimeEnabled;
        const isPageLink = available && typeof variant.pagePath === 'string';
        const card = createElement(documentObject, 'button', 'game-mode-card game-hub-card');
        card.type = 'button';
        card.dataset.gameVariant = variant.key;
        card.dataset.gameContext = variant.context;

        if (available) {
            if (variant.modeChoice) {
                card.dataset.gameModeChoice = variant.modeChoice;
                card.setAttribute('aria-pressed', 'false');
            }
            if (isPageLink) {
                card.dataset.gameModePage = variant.pagePath;
                card.setAttribute('aria-label', `${variant.title} · deschide pagina modului`);
            }
        } else {
            card.disabled = true;
            card.classList.add(runtimeEnabled ? 'is-coming-soon' : 'is-runtime-disabled');
            card.setAttribute('aria-disabled', 'true');
            card.title = runtimeEnabled
                ? `${variant.title} va fi disponibil într-un update viitor.`
                : `${variant.title} este temporar dezactivat.`;
        }

        const topRow = createElement(documentObject, 'span', 'game-hub-card-top');
        const icon = createElement(documentObject, 'span', 'mode-icon', variant.icon);
        icon.setAttribute('aria-hidden', 'true');
        topRow.append(icon);
        topRow.append(createElement(
            documentObject,
            'span',
            available ? 'game-hub-state is-available' : 'game-hub-state',
            available ? 'Disponibil' : (runtimeEnabled ? 'În curând' : 'Dezactivat')
        ));

        const title = createElement(documentObject, 'strong', 'game-hub-card-title', variant.title);
        const description = createElement(documentObject, 'small', 'game-hub-card-description', variant.description);
        const tags = createElement(documentObject, 'span', 'game-hub-card-tags');
        for (const tag of variant.tags || []) tags.append(createTag(documentObject, tag));

        card.append(topRow, title, description, tags);
        return card;
    }

    function createSection(documentObject, {
        title,
        description,
        variants,
        modifier = ''
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
        for (const variant of variants) grid.append(createModeCard(documentObject, variant, globalObject?.F1RuntimeSettings));

        section.append(header, grid);
        return section;
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

            const available = registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.AVAILABLE);
            const comingSoon = registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.COMING_SOON);
            const sections = [
                createSection(documentObject, {
                    title: 'Joacă acum',
                    description: 'Alege experiența pe care vrei să o pornești.',
                    variants: available,
                    modifier: 'game-hub-section--available'
                })
            ];
            if (comingSoon.length > 0) {
                sections.push(createSection(documentObject, {
                    title: 'În dezvoltare',
                    description: 'Următoarele moduri vor fi activate treptat în update-urile viitoare.',
                    variants: comingSoon,
                    modifier: 'game-hub-section--upcoming'
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
