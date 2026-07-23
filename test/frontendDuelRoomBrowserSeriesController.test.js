const assert = require('node:assert/strict');
const test = require('node:test');

async function importController() {
    return import(`../public/js/duelRoomBrowserSeriesController.js?test=${Date.now()}-${Math.random()}`);
}

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        contains: name => values.has(name)
    };
}

function createElement(tag = 'div', classes = []) {
    const children = [];
    return {
        tagName: tag.toUpperCase(),
        className: classes.join(' '),
        classList: createClassList(classes),
        dataset: {},
        textContent: '',
        children,
        append(...nodes) {
            nodes.forEach(node => {
                node.parentNode = this;
                node.remove = () => {
                    const index = children.indexOf(node);
                    if (index >= 0) children.splice(index, 1);
                };
                children.push(node);
            });
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            const className = selector.startsWith('.') ? selector.slice(1) : '';
            const matches = [];
            function visit(node) {
                for (const child of node.children || []) {
                    const classes = String(child.className || '').split(/\s+/).filter(Boolean);
                    if (className && classes.includes(className)) matches.push(child);
                    visit(child);
                }
            }
            visit(this);
            return matches;
        }
    };
}

function createDocument(rooms = []) {
    const cards = rooms.map(roomId => {
        const card = createElement('article', ['duel-room-card']);
        card.dataset.roomId = roomId;
        card.append(createElement('div', ['duel-room-card-meta']));
        return card;
    });

    return {
        cards,
        createElement,
        querySelectorAll(selector) {
            return selector === '.duel-room-card' ? cards : [];
        }
    };
}

test('room series metadata uses compact Best of progress and numeric score', async () => {
    const { buildRoomSeriesMeta } = await importController();

    assert.deepEqual(
        buildRoomSeriesMeta({
            bestOf: 3,
            roundsPlayed: 2,
            score: [1, 1]
        }),
        {
            bestOf: 3,
            roundsPlayed: 2,
            bestOfLabel: 'Best of 2/3',
            scoreLabel: 'Scor 1–1'
        }
    );
});

test('room series metadata caps draw-extended progress and supports legacy rooms', async () => {
    const { buildRoomSeriesMeta } = await importController();

    assert.equal(buildRoomSeriesMeta({
        bestOf: 3,
        roundsPlayed: 4,
        score: [1, 1]
    }).bestOfLabel, 'Best of 3/3+');

    assert.deepEqual(
        buildRoomSeriesMeta({ lobbySettings: { bestOf: 5 } }),
        {
            bestOf: 5,
            roundsPlayed: 0,
            bestOfLabel: 'Best of 0/5',
            scoreLabel: 'Scor 0–0'
        }
    );
});

test('room series controller appends and replaces badges after room list updates', async () => {
    const { createController } = await importController();
    const document = createDocument(['ROOM1']);
    const handlers = new Map();
    const scheduled = [];
    const controller = createController({
        document,
        schedule: callback => scheduled.push(callback)
    });

    controller.attachSocket({
        on(eventName, handler) {
            handlers.set(eventName, handler);
        }
    });
    handlers.get('roomListUpdate')({
        rooms: [{
            roomId: 'ROOM1',
            bestOf: 3,
            roundsPlayed: 2,
            score: [1, 1]
        }]
    });

    assert.equal(document.cards[0].querySelectorAll('.duel-room-series-meta').length, 0);
    scheduled.shift()();

    let badges = document.cards[0].querySelectorAll('.duel-room-series-meta');
    assert.deepEqual(badges.map(item => item.textContent), ['Best of 2/3', 'Scor 1–1']);

    controller.render([{
        roomId: 'ROOM1',
        bestOf: 5,
        roundsPlayed: 1,
        score: [1, 0]
    }]);

    badges = document.cards[0].querySelectorAll('.duel-room-series-meta');
    assert.deepEqual(badges.map(item => item.textContent), ['Best of 1/5', 'Scor 1–0']);
});
