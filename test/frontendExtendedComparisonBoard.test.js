const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'public', 'js', 'extendedComparisonBoard.js');
let modulePromise = null;
let tempDirectory = null;

class FakeClassList {
    constructor(element) {
        this.element = element;
        this.values = new Set();
    }

    syncFromClassName(value) {
        this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
    }

    syncToClassName() {
        this.element._className = [...this.values].join(' ');
    }

    add(...values) {
        values.filter(Boolean).forEach(value => this.values.add(value));
        this.syncToClassName();
    }

    remove(...values) {
        values.forEach(value => this.values.delete(value));
        this.syncToClassName();
    }

    contains(value) {
        return this.values.has(value);
    }
}

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName || '').toUpperCase();
        this.children = [];
        this.attributes = new Map();
        this.hidden = false;
        this.textContent = '';
        this._className = '';
        this.classList = new FakeClassList(this);
    }

    set className(value) {
        this._className = String(value || '');
        this.classList.syncFromClassName(this._className);
    }

    get className() {
        return this._className;
    }

    append(...children) {
        this.children.push(...children);
    }

    replaceChildren(...children) {
        this.children = [...children];
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }
}

function createFakeDocument() {
    return {
        createElement(tagName) {
            return new FakeElement(tagName);
        }
    };
}

async function loadModule() {
    if (!modulePromise) {
        tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-comparison-board-'));
        const modulePath = path.join(tempDirectory, 'extendedComparisonBoard.mjs');
        fs.copyFileSync(sourcePath, modulePath);
        modulePromise = import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
    }
    return modulePromise;
}

test.after(() => {
    if (tempDirectory) fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('comparison schemas cover only the five Classic-style extended modes', async () => {
    const { resolveComparisonEntityType, resolveComparisonSchema } = await loadModule();

    for (const variantKey of ['speed-run', 'era', 'streak', 'weekly']) {
        assert.equal(resolveComparisonEntityType({ variantKey }), 'driver');
        assert.equal(resolveComparisonSchema({ variantKey }).length, 6);
    }
    assert.equal(resolveComparisonEntityType({ variantKey: 'constructor' }), 'constructor');
    assert.equal(resolveComparisonSchema({ variantKey: 'constructor' }).length, 6);
    assert.equal(resolveComparisonEntityType({ variantKey: 'pilot-sudoku', entityType: 'driver' }), '');
    assert.equal(resolveComparisonEntityType({ variantKey: 'track', entityType: 'driver' }), '');
});

test('driver board renders Classic headers, empty attempts and directional feedback', async () => {
    const { createExtendedComparisonBoard } = await loadModule();
    const documentObject = createFakeDocument();
    const rootElement = new FakeElement('section');
    const board = createExtendedComparisonBoard({ documentObject, root: rootElement });

    assert.equal(board.startRound({ variantKey: 'speed-run', entityType: 'driver', maxAttempts: 6 }), true);
    assert.equal(rootElement.classList.contains('extended-classic-board'), true);
    assert.equal(rootElement.children.length, 7);
    assert.deepEqual(
        rootElement.children[0].children.map(cell => cell.textContent),
        ['#', 'Pilot', 'Țară', 'Echipă', 'Vârstă', 'Debut', 'Victorii']
    );

    assert.equal(board.appendFeedback({
        entityType: 'driver',
        cells: [
            { key: 'name', value: 'Ayrton Senna', state: 'red' },
            { key: 'nat', value: 'BRA', state: 'green' },
            { key: 'team', value: 'McLaren', state: 'yellow' },
            { key: 'age', value: 34, state: 'orange' },
            { key: 'debut', value: 1984, state: 'purple' },
            { key: 'wins', value: 41, state: 'green' }
        ]
    }), true);

    const firstAttempt = rootElement.children[1];
    assert.equal(firstAttempt.classList.contains('is-completed'), true);
    assert.equal(firstAttempt.children[4].children[1].textContent, '↑');
    assert.equal(firstAttempt.children[5].children[1].textContent, '↓');
    assert.equal(rootElement.children[2].children[1].classList.contains('is-empty'), true);
});

test('Streak keeps its three-attempt rule while reusing the same board component', async () => {
    const { createExtendedComparisonBoard } = await loadModule();
    const documentObject = createFakeDocument();
    const rootElement = new FakeElement('section');
    const board = createExtendedComparisonBoard({ documentObject, root: rootElement });

    board.startRound({ variantKey: 'streak', entityType: 'driver', maxAttempts: 3 });
    assert.equal(rootElement.children.length, 4);
    assert.equal(board.getSnapshot().maxAttempts, 3);
});

test('constructor board uses a declarative six-column schema', async () => {
    const { createExtendedComparisonBoard } = await loadModule();
    const documentObject = createFakeDocument();
    const rootElement = new FakeElement('section');
    const board = createExtendedComparisonBoard({ documentObject, root: rootElement });

    board.startRound({ variantKey: 'constructor', entityType: 'constructor', maxAttempts: 6 });
    assert.deepEqual(
        rootElement.children[0].children.map(cell => cell.textContent),
        ['#', 'Constructor', 'Țară', 'Debut', 'Titluri', 'Status', 'Eră']
    );
    assert.deepEqual(board.getSnapshot(), {
        enabled: true,
        entityType: 'constructor',
        maxAttempts: 6,
        feedbackCount: 0,
        variantKey: 'constructor'
    });
});

test('Track Guesser and Pilot Sudoku keep their separate presentation', async () => {
    const { createExtendedComparisonBoard } = await loadModule();
    const documentObject = createFakeDocument();

    for (const variantKey of ['track', 'pilot-sudoku']) {
        const rootElement = new FakeElement('section');
        const board = createExtendedComparisonBoard({ documentObject, root: rootElement });
        assert.equal(board.startRound({ variantKey, entityType: 'driver', maxAttempts: 6 }), false);
        assert.equal(board.getSnapshot().enabled, false);
        assert.equal(rootElement.classList.contains('extended-classic-board'), false);
        assert.equal(rootElement.children.length, 0);

        const legacyRow = new FakeElement('article');
        rootElement.append(legacyRow);
        assert.equal(board.syncRound({ variantKey, entityType: 'driver', maxAttempts: 6 }), false);
        assert.equal(rootElement.children[0], legacyRow);
    }
});
