const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function importController() {
    return import(`../public/js/duelRoundHistoryController.js?roundHistoryTest=${Date.now()}-${Math.random()}`);
}

function createClassList() {
    const values = new Set();
    return {
        toggle(name, force) {
            const enabled = force === undefined ? !values.has(name) : Boolean(force);
            if (enabled) values.add(name);
            else values.delete(name);
            return enabled;
        },
        contains: name => values.has(name)
    };
}

function createElement(tagName = 'div') {
    return {
        tagName: String(tagName).toUpperCase(),
        className: '',
        classList: createClassList(),
        dataset: {},
        textContent: '',
        hidden: false,
        children: [],
        append(...children) {
            this.children.push(...children);
        },
        replaceChildren(...children) {
            this.children = children;
        }
    };
}

function createDocumentStub() {
    const elements = new Map([
        ['duelRoundHistory', createElement('section')],
        ['duelRoundHistoryCount', createElement('span')],
        ['duelRoundHistoryEmpty', createElement('p')],
        ['duelRoundHistoryList', createElement('div')]
    ]);
    return {
        elements,
        createElement,
        getElementById(id) {
            return elements.get(id) || null;
        }
    };
}

function createEntry(sequence = 2) {
    return {
        id: `round-${sequence}`,
        sequence,
        status: 'win',
        winnerUsername: 'Host',
        difficulty: 'hard',
        timed: true,
        timeLimitSeconds: 90,
        durationMs: 12_500,
        target: { name: 'Max Verstappen' },
        scoreboard: [
            { username: 'Host', wins: 2 },
            { username: 'Guest', wins: 0 }
        ],
        match: { roundsPlayed: sequence, bestOf: 5 },
        players: [
            {
                username: 'Host',
                outcome: 'win',
                attempts: 1,
                guesses: [{ attempt: 1, guess: { name: 'Max Verstappen' }, isCorrect: true }]
            },
            {
                username: 'Guest',
                outcome: 'loss',
                attempts: 2,
                guesses: [{ attempt: 1, guess: { name: 'Lando Norris' }, isCorrect: false }]
            }
        ]
    };
}

test('round history formatter builds compact result and replay summaries', async () => {
    const {
        buildPlayerSummary,
        buildRoundMeta,
        buildRoundTitle,
        buildScoreText,
        formatDuration
    } = await importController();
    const entry = createEntry();

    assert.equal(buildRoundTitle(entry), 'Runda 2 · Host');
    assert.match(buildRoundMeta(entry), /Max Verstappen · Hard · Best of 5 · 13 sec · limită 90s/);
    assert.equal(buildScoreText(entry.scoreboard), 'Host 2 – Guest 0');
    assert.equal(buildPlayerSummary(entry.players[0]), 'Host · victorie · 1 încercare');
    assert.equal(formatDuration(65_000), '1m 5s');
});

test('controller renders newest history entries and empty state safely', async () => {
    const { createDuelRoundHistoryController } = await importController();
    const document = createDocumentStub();
    const controller = createDuelRoundHistoryController({ document, schedule: callback => callback() });

    controller.render({ roundHistory: [createEntry(3), createEntry(2)] });

    assert.equal(document.getElementById('duelRoundHistoryCount').textContent, '2/10');
    assert.equal(document.getElementById('duelRoundHistoryEmpty').hidden, true);
    assert.equal(document.getElementById('duelRoundHistoryList').hidden, false);
    assert.equal(document.getElementById('duelRoundHistoryList').children.length, 2);
    assert.equal(document.getElementById('duelRoundHistoryList').children[0].dataset.roundHistoryId, 'round-3');
    assert.equal(document.getElementById('duelRoundHistory').classList.contains('has-history'), true);

    controller.render({ roundHistory: [] });
    assert.equal(document.getElementById('duelRoundHistoryCount').textContent, '0/10');
    assert.equal(document.getElementById('duelRoundHistoryEmpty').hidden, false);
    assert.equal(document.getElementById('duelRoundHistoryList').hidden, true);
});

test('HTML loads versioned round history styles and controller after the main bundle', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const bundleIndex = html.indexOf('/game.bundle.min.js?v=');
    const controllerIndex = html.indexOf('/js/duelRoundHistoryController.js?v=');

    assert.match(html, /id="duelRoundHistory"/);
    assert.match(html, /id="duelRoundHistoryList"/);
    assert.match(html, /\/css\/18-duel-round-history\.css\?v=[a-f0-9]{16}/);
    assert.ok(controllerIndex > bundleIndex);
    assert.match(html, /<script type="module" src="\/js\/duelRoundHistoryController\.js\?v=[a-f0-9]{16}"><\/script>/);
});
