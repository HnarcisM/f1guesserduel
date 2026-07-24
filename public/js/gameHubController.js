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

    function createModeCard(documentObject, variant) {
        const available = variant.state === 'available';
        const card = createElement(documentObject, 'button', 'game-mode-card game-hub-card');
        card.type = 'button';
        card.dataset.gameVariant = variant.key;
        card.dataset.gameContext = variant.context;

        if (available && variant.modeChoice) {
            card.dataset.gameModeChoice = variant.modeChoice;
            card.setAttribute('aria-pressed', String(Boolean(variant.defaultSelected)));
            card.classList.toggle('active', Boolean(variant.defaultSelected));
        } else {
            card.disabled = true;
            card.classList.add('is-coming-soon');
            card.setAttribute('aria-disabled', 'true');
            card.title = `${variant.title} va fi disponibil într-un update viitor.`;
        }

        const topRow = createElement(documentObject, 'span', 'game-hub-card-top');
        const icon = createElement(documentObject, 'span', 'mode-icon', variant.icon);
        icon.setAttribute('aria-hidden', 'true');
        topRow.append(icon);
        topRow.append(createElement(
            documentObject,
            'span',
            available ? 'game-hub-state is-available' : 'game-hub-state',
            available ? 'Disponibil' : 'În curând'
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
        for (const variant of variants) grid.append(createModeCard(documentObject, variant));

        section.append(header, grid);
        return section;
    }

    function createGameHubController({
        documentObject = globalObject?.document,
        registry = globalObject?.F1GameVariantRegistry,
        rootId = 'gameModeHub'
    } = {}) {
        function render() {
            const root = documentObject?.getElementById?.(rootId);
            if (!root || !registry) return false;

            const available = registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.AVAILABLE);
            const comingSoon = registry.listGameVariantsByState(registry.GAME_VARIANT_STATES.COMING_SOON);

            root.replaceChildren(
                createSection(documentObject, {
                    title: 'Joacă acum',
                    description: 'Alege experiența pe care vrei să o pornești.',
                    variants: available,
                    modifier: 'game-hub-section--available'
                }),
                createSection(documentObject, {
                    title: 'În dezvoltare',
                    description: 'Următoarele moduri vor fi activate treptat în update-urile viitoare.',
                    variants: comingSoon,
                    modifier: 'game-hub-section--upcoming'
                })
            );
            root.dataset.gameHubReady = 'true';
            return true;
        }

        return { render };
    }

    function installGameHubController(windowObject = globalObject) {
        if (!windowObject?.document || !windowObject.F1GameVariantRegistry) return null;
        if (windowObject.__f1GameHubController) return windowObject.__f1GameHubController;

        const controller = createGameHubController({
            documentObject: windowObject.document,
            registry: windowObject.F1GameVariantRegistry
        });
        const render = () => controller.render();

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
})(typeof globalThis !== 'undefined' ? globalThis : null);
