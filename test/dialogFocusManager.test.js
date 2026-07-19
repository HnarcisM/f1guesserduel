const assert = require('node:assert/strict');
const test = require('node:test');

function createElement(documentStub, { attrs = {}, classes = [] } = {}) {
    const attributes = new Map(Object.entries(attrs));
    const listeners = new Map();
    const classNames = new Set(classes);
    const element = {
        disabled: false,
        hidden: false,
        classList: { contains: name => classNames.has(name) },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.get(name) ?? null; },
        addEventListener(name, handler) { listeners.set(name, handler); },
        focus() { documentStub.activeElement = element; },
        listeners
    };
    return element;
}

test('dialog focus manager traps Tab, closes on Escape and restores focus', async t => {
    const originalDocument = globalThis.document;
    const documentStub = { activeElement: null };
    globalThis.document = documentStub;
    t.after(() => {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    });

    const trigger = createElement(documentStub);
    const first = createElement(documentStub);
    const last = createElement(documentStub);
    const dialog = createElement(documentStub, { attrs: { 'aria-hidden': 'true' } });
    dialog.querySelectorAll = () => [first, last];
    trigger.focus();

    let escaped = false;
    const { createDialogFocusManager } = await import('../public/js/dialogFocusManager.js');
    const manager = createDialogFocusManager({
        dialog,
        onEscape: () => { escaped = true; },
        getInitialFocus: () => first
    });

    manager.activate();
    assert.equal(dialog.getAttribute('aria-hidden'), 'false');
    assert.equal(dialog.inert, false);
    assert.equal(documentStub.activeElement, first);

    last.focus();
    let prevented = false;
    manager.handleKeydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(documentStub.activeElement, first);

    first.focus();
    manager.handleKeydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
    assert.equal(documentStub.activeElement, last);

    manager.handleKeydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(escaped, true);

    manager.deactivate();
    assert.equal(dialog.getAttribute('aria-hidden'), 'true');
    assert.equal(dialog.inert, true);
    assert.equal(documentStub.activeElement, trigger);
});

test('dialog focus manager ignores hidden, nested hidden or disabled controls', async t => {
    const originalDocument = globalThis.document;
    const documentStub = { activeElement: null };
    globalThis.document = documentStub;
    t.after(() => {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    });

    const hidden = createElement(documentStub, { classes: ['is-hidden'] });
    const disabled = createElement(documentStub);
    disabled.disabled = true;
    const nestedHidden = createElement(documentStub);
    nestedHidden.closest = () => ({ hidden: true });
    const available = createElement(documentStub);
    const dialog = createElement(documentStub);
    dialog.querySelectorAll = () => [hidden, disabled, nestedHidden, available];

    const { getDialogFocusableElements } = await import('../public/js/dialogFocusManager.js');
    assert.deepEqual(getDialogFocusableElements(dialog), [available]);
});
