const assert = require('node:assert/strict');
const test = require('node:test');

function createClassList(element) {
    const classes = new Set();
    return {
        add(...names) {
            names.forEach(name => classes.add(name));
            element.className = [...classes].join(' ');
        },
        remove(...names) {
            names.forEach(name => classes.delete(name));
            element.className = [...classes].join(' ');
        },
        contains(name) {
            return classes.has(name) || String(element.className).split(/\s+/).includes(name);
        }
    };
}

function createElement(tagName = 'div') {
    const listeners = new Map();
    const attributes = new Map();
    const element = {
        tagName: String(tagName).toUpperCase(),
        id: '',
        className: '',
        children: [],
        dataset: {},
        hidden: false,
        value: '',
        textContent: '',
        append(...children) {
            this.children.push(...children);
        },
        replaceChildren(...children) {
            this.children = [...children];
        },
        addEventListener(name, handler) {
            listeners.set(name, handler);
        },
        click() {
            listeners.get('click')?.({ target: this });
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.get(name) ?? null;
        },
        removeAttribute(name) {
            attributes.delete(name);
        },
        querySelectorAll(selector) {
            if (selector === '[role="option"]') {
                return this.children.filter(child => child.getAttribute?.('role') === 'option');
            }
            return [];
        },
        scrollIntoView() {
            this.scrolledIntoView = true;
        },
        listeners
    };
    element.classList = createClassList(element);
    return element;
}

function createDocument() {
    const head = createElement('head');
    return {
        head,
        createElement,
        querySelector(selector) {
            if (selector !== 'link[data-extended-autocomplete-style]') return null;
            return head.children.find(child => child.dataset?.extendedAutocompleteStyle === 'true') || null;
        }
    };
}

function createAutocompleteContext({ variantKey = 'speed-run', catalog = [] } = {}) {
    const documentObject = createDocument();
    const input = createElement('input');
    input.id = 'extendedGuessInput';
    const suggestions = createElement('div');
    suggestions.id = 'extendedSuggestions';
    let currentVariant = variantKey;
    let currentCatalog = catalog;
    let submitCount = 0;
    return {
        documentObject,
        input,
        suggestions,
        getVariantKey: () => currentVariant,
        getCatalog: () => currentCatalog,
        onSubmit: () => { submitCount += 1; },
        setVariant: value => { currentVariant = value; },
        setCatalog: value => { currentCatalog = value; },
        getSubmitCount: () => submitCount
    };
}

function createKeyEvent(key) {
    return {
        key,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; }
    };
}

test('extended autocomplete renders driver flags, constructor logos and track flags', async () => {
    const { createExtendedModeAutocomplete } = await import('../public/js/extendedModeAutocomplete.js');
    const context = createAutocompleteContext({
        catalog: [{ id: 'VER', name: 'Max Verstappen', nat: 'NED' }]
    });
    const autocomplete = createExtendedModeAutocomplete(context);

    context.input.value = 'max';
    autocomplete.renderSuggestions();
    let [suggestion] = context.suggestions.children;
    let [visual, copy] = suggestion.children;
    assert.equal(visual.src, '/flags/nl.svg');
    assert.equal(visual.classList.contains('is-flag'), true);
    assert.equal(copy.children[0].textContent, 'Max Verstappen');
    assert.equal(copy.children[1].textContent, 'NED');

    context.setVariant('constructor');
    context.setCatalog([{ id: 'ferrari', name: 'Ferrari', country: 'ITA', active: true }]);
    context.input.value = 'fer';
    autocomplete.renderSuggestions();
    [suggestion] = context.suggestions.children;
    [visual, copy] = suggestion.children;
    assert.equal(visual.src, '/logos/Ferrari.webp');
    assert.equal(visual.classList.contains('is-logo'), true);
    assert.equal(copy.children[1].textContent, 'ITA · Activ');

    context.setVariant('track');
    context.setCatalog([{ id: 'jeddah', name: 'Jeddah Corniche Circuit', country: 'KSA', firstGrandPrix: 2021 }]);
    context.input.value = 'jed';
    autocomplete.renderSuggestions();
    [suggestion] = context.suggestions.children;
    [visual, copy] = suggestion.children;
    assert.equal(visual.src, '/flags/sa.svg');
    assert.equal(copy.children[1].textContent, 'KSA · Primul GP 2021');

    assert.equal(context.documentObject.head.children.length, 1);
    assert.equal(context.documentObject.head.children[0].href, '/css/28-extended-mode-autocomplete.css');
});

test('arrow navigation selects and submits the active suggestion with Enter', async () => {
    const { createExtendedModeAutocomplete } = await import('../public/js/extendedModeAutocomplete.js');
    const context = createAutocompleteContext({
        catalog: [
            { id: 'HAM', name: 'Lewis Hamilton', nat: 'GBR' },
            { id: 'LEC', name: 'Charles Leclerc', nat: 'MON' }
        ]
    });
    const autocomplete = createExtendedModeAutocomplete(context);

    context.input.value = 'l';
    autocomplete.renderSuggestions();
    const down = createKeyEvent('ArrowDown');
    autocomplete.handleKeydown(down);

    const first = context.suggestions.children[0];
    assert.equal(down.prevented, true);
    assert.equal(first.classList.contains('is-active'), true);
    assert.equal(first.getAttribute('aria-selected'), 'true');
    assert.equal(context.input.getAttribute('aria-activedescendant'), first.id);
    assert.equal(first.scrolledIntoView, true);

    const enter = createKeyEvent('Enter');
    autocomplete.handleKeydown(enter);
    assert.equal(enter.prevented, true);
    assert.equal(context.input.value, 'Lewis Hamilton');
    assert.equal(autocomplete.getSelectedEntityId(), 'HAM');
    assert.equal(context.getSubmitCount(), 1);
    assert.equal(context.suggestions.hidden, true);
});

test('ArrowUp wraps to the final result and clicking a suggestion submits immediately', async () => {
    const { createExtendedModeAutocomplete } = await import('../public/js/extendedModeAutocomplete.js');
    const context = createAutocompleteContext({
        catalog: [
            { id: 'HAM', name: 'Lewis Hamilton', nat: 'GBR' },
            { id: 'LEC', name: 'Charles Leclerc', nat: 'MON' }
        ]
    });
    const autocomplete = createExtendedModeAutocomplete(context);

    context.input.value = 'l';
    autocomplete.renderSuggestions();
    autocomplete.handleKeydown(createKeyEvent('ArrowUp'));
    const last = context.suggestions.children.at(-1);
    assert.equal(last.classList.contains('is-active'), true);

    last.click();
    assert.equal(context.input.value, 'Charles Leclerc');
    assert.equal(autocomplete.getSelectedEntityId(), 'LEC');
    assert.equal(context.getSubmitCount(), 1);
});

test('Escape closes the list without closing the surrounding mode', async () => {
    const { createExtendedModeAutocomplete } = await import('../public/js/extendedModeAutocomplete.js');
    const context = createAutocompleteContext({
        catalog: [{ id: 'VER', name: 'Max Verstappen', nat: 'NED' }]
    });
    const autocomplete = createExtendedModeAutocomplete(context);

    context.input.value = 'max';
    autocomplete.renderSuggestions();
    const escape = createKeyEvent('Escape');
    autocomplete.handleKeydown(escape);

    assert.equal(escape.prevented, true);
    assert.equal(escape.stopped, true);
    assert.equal(context.suggestions.hidden, true);
    assert.equal(context.input.getAttribute('aria-expanded'), 'false');
});
