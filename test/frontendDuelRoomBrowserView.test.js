const test = require('node:test');
const assert = require('node:assert/strict');

function createClassList(initialClasses = []) {
    const classes = new Set(initialClasses);
    return {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        toggle(name, force) {
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
            if (shouldAdd) classes.add(name);
            else classes.delete(name);
            return shouldAdd;
        },
        contains(name) { return classes.has(name); },
        toArray() { return Array.from(classes); }
    };
}

function createElement(tag = 'div', { id = '', classes = [] } = {}) {
    const listeners = new Map();
    const children = [];
    const element = {
        tagName: tag.toUpperCase(),
        id,
        className: classes.join(' '),
        classList: createClassList(classes),
        dataset: {},
        attributes: {},
        textContent: '',
        type: '',
        children,
        append(...nodes) { nodes.forEach(node => children.push(node)); },
        appendChild(node) { children.push(node); return node; },
        replaceChildren(...nodes) { children.length = 0; nodes.forEach(node => children.push(node)); },
        addEventListener(eventName, handler) { listeners.set(eventName, handler); },
        click() { listeners.get('click')?.({ target: this }); },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name]; },
        querySelectorAll(selector) {
            const results = [];
            function walk(node) {
                if (!node || !node.children) return;
                for (const child of node.children) {
                    if (selector.startsWith('.')) {
                    const className = String(child.className || '');
                    const hasClass = child.classList?.contains(selector.slice(1)) || className.split(/\s+/).includes(selector.slice(1));
                    if (hasClass) results.push(child);
                }
                    walk(child);
                }
            }
            walk(this);
            return results;
        }
    };
    return element;
}

function setupDocument() {
    const elementsById = new Map();
    const body = createElement('body');
    for (const [id, element] of [
        ['duelRoomBrowserPanel', createElement('div', { id: 'duelRoomBrowserPanel', classes: ['is-hidden'] })],
        ['duelRoomList', createElement('div', { id: 'duelRoomList' })],
        ['duelRoomBrowserEmpty', createElement('p', { id: 'duelRoomBrowserEmpty' })],
        ['duelCreateRoomBtn', createElement('button', { id: 'duelCreateRoomBtn' })],
        ['duelRefreshRoomsBtn', createElement('button', { id: 'duelRefreshRoomsBtn' })]
    ]) {
        elementsById.set(id, element);
    }

    global.document = {
        body,
        createElement,
        getElementById(id) { return elementsById.get(id) || null; }
    };
    global.window = { setTimeout() {}, clearTimeout() {} };

    return {
        panel: elementsById.get('duelRoomBrowserPanel'),
        list: elementsById.get('duelRoomList'),
        empty: elementsById.get('duelRoomBrowserEmpty'),
        createButton: elementsById.get('duelCreateRoomBtn'),
        refreshButton: elementsById.get('duelRefreshRoomsBtn')
    };
}

test('Duel room browser renders room cards and joins selected room', async () => {
    const dom = setupDocument();
    const { setupDuelRoomBrowserView, renderDuelRoomBrowser, setDuelRoomBrowserVisible } = await import('../public/js/duelRoomBrowserView.js');
    let joinedRoomId = null;
    let refreshCount = 0;

    setupDuelRoomBrowserView({
        onJoinRoom: (roomId) => { joinedRoomId = roomId; },
        onRefreshRooms: () => { refreshCount += 1; }
    });

    setDuelRoomBrowserVisible(true);
    renderDuelRoomBrowser({
        rooms: [{
            roomId: 'ROOM123',
            hostUsername: 'Narcis',
            playerCount: 1,
            spectatorCount: 0,
            maxPlayers: 2,
            roundState: 'waiting',
            statusLabel: 'Lobby',
            canJoinAsPlayer: true,
            lobbySettings: { difficulty: 'easy', timed: false, timeLimitSeconds: 60 }
        }]
    });

    assert.equal(dom.panel.classList.contains('is-hidden'), false);
    assert.equal(dom.empty.classList.contains('is-hidden'), true);
    assert.equal(dom.list.children.length, 1);
    assert.equal(refreshCount, 1);

    const joinButton = dom.list.children[0].querySelectorAll('.duel-room-join-btn')[0];
    joinButton.click();

    assert.equal(joinedRoomId, 'ROOM123');
});

test('Duel room browser exposes create and refresh actions', async () => {
    const dom = setupDocument();
    const { setupDuelRoomBrowserView } = await import('../public/js/duelRoomBrowserView.js');
    let createCount = 0;
    let refreshCount = 0;

    setupDuelRoomBrowserView({
        onCreateRoom: () => { createCount += 1; },
        onRefreshRooms: () => { refreshCount += 1; }
    });

    dom.createButton.click();
    dom.refreshButton.click();

    assert.equal(createCount, 1);
    assert.equal(refreshCount, 1);
});
