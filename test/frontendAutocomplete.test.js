const test = require('node:test');
const assert = require('node:assert/strict');

function createClassList() {
    const classes = new Set();
    return {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); }
    };
}

function createElement(tagName = 'div') {
    let ownTextContent = '';
    const attributes = new Map();
    const listeners = new Map();

    return {
        tagName: String(tagName).toUpperCase(),
        children: [],
        dataset: {},
        classList: createClassList(),
        className: '',
        value: '',
        get textContent() {
            return ownTextContent + this.children.map(child => child.textContent || '').join('');
        },
        set textContent(value) {
            ownTextContent = String(value);
            this.children = [];
        },
        append(...children) {
            this.children.push(...children);
        },
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        addEventListener(name, handler) {
            listeners.set(name, handler);
        },
        click() {
            listeners.get('click')?.();
        },
        getElementsByTagName(name) {
            const normalizedName = String(name).toUpperCase();
            return this.children.flatMap(child => [
                ...(child.tagName === normalizedName ? [child] : []),
                ...(child.getElementsByTagName?.(name) || [])
            ]);
        },
        replaceChildren(...children) {
            ownTextContent = '';
            this.children = [...children];
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.get(name) ?? null;
        },
        scrollIntoView() {}
    };
}

function setupDocument() {
    const suggestions = createElement('ul');
    const input = createElement('input');
    global.document = {
        createElement,
        getElementById(id) {
            if (id === 'suggestions') return suggestions;
            if (id === 'driverInput') return input;
            return null;
        }
    };
    return { suggestions, input };
}

test('autocomplete renders a local nationality flag next to the driver name', async () => {
    const { createAutocomplete } = await import('../public/js/autocomplete.js');
    const { suggestions } = setupDocument();
    const autocomplete = createAutocomplete({
        getDriversList: () => [{ id: 'VER', name: 'Max Verstappen', nat: 'NED' }],
        onSubmitGuess() {}
    });

    autocomplete.showPredictions('max');

    assert.equal(suggestions.children.length, 1);
    const [suggestion] = suggestions.children;
    const [flag, name] = suggestion.children;
    assert.equal(suggestion.dataset.name, 'Max Verstappen');
    assert.equal(flag.className, 'suggestion-driver-flag');
    assert.equal(flag.src, '/flags/nl.svg');
    assert.equal(flag.alt, '');
    assert.equal(flag.getAttribute('aria-hidden'), 'true');
    assert.equal(name.className, 'suggestion-driver-name');
    assert.equal(name.textContent, 'Max Verstappen');

    flag.onerror();
    assert.equal(flag.src, '/flags/un.svg');
    assert.equal(flag.onerror, null);
});

test('keyboard selection keeps the exact driver name after adding the flag', async () => {
    const { createAutocomplete } = await import('../public/js/autocomplete.js');
    const { input } = setupDocument();
    let submitCount = 0;
    const autocomplete = createAutocomplete({
        getDriversList: () => [{ id: 'HAM', name: 'Lewis Hamilton', nat: 'GBR' }],
        onSubmitGuess() { submitCount += 1; }
    });

    autocomplete.showPredictions('lew');
    autocomplete.handleKeydown({ key: 'ArrowDown', preventDefault() {} });
    autocomplete.handleKeydown({ key: 'Enter', preventDefault() {} });

    assert.equal(input.value, 'Lewis Hamilton');
    assert.equal(autocomplete.getSelectedDriverId(), 'HAM');
    assert.equal(submitCount, 1);
});
