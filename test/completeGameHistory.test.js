const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    ACCOUNT_GAME_HISTORY_COLUMNS,
    ensureSqliteAccountGameHistoryColumns
} = require('../server/db/sqliteSchemaUpgrade');

async function importController() {
    return import(`../public/js/accountGameHistoryController.js?test=${Date.now()}-${Math.random()}`);
}

function createClassList() {
    const values = new Set();
    return {
        add: (...names) => names.forEach(name => values.add(name)),
        remove: (...names) => names.forEach(name => values.delete(name)),
        contains: name => values.has(name)
    };
}

function createElement(tagName = 'div') {
    const listeners = new Map();
    return {
        tagName: tagName.toUpperCase(),
        children: [],
        className: '',
        classList: createClassList(),
        textContent: '',
        title: '',
        dateTime: '',
        append(...children) {
            this.children.push(...children);
        },
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        replaceChildren(...children) {
            this.children = [...children];
        },
        addEventListener(name, handler) {
            listeners.set(name, handler);
        },
        click() {
            return listeners.get('click')?.({ target: this });
        }
    };
}

function createDocument() {
    const elements = new Map([
        ['authGameHistory', createElement('section')],
        ['authTabHistory', createElement('button')]
    ]);
    return {
        createElement,
        getElementById(id) {
            return elements.get(id) || null;
        }
    };
}

test('Postgres migration extends game results without editing migration 002', () => {
    const migration002 = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'db', 'migrations', 'postgres', '002_account_game_stats.sql'),
        'utf8'
    );
    const migration007 = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'db', 'migrations', 'postgres', '007_complete_game_history.sql'),
        'utf8'
    );

    assert.doesNotMatch(migration002, /target_driver_id/);
    for (const column of [
        'target_driver_id',
        'target_driver_name',
        'duration_ms',
        'room_id',
        'match_id',
        'opponent_username',
        'winner_username'
    ]) {
        assert.match(migration007, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
    }
});

test('SQLite startup applies the idempotent account history upgrade', () => {
    const databaseSource = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'db', 'database.js'),
        'utf8'
    );

    assert.match(databaseSource, /ensureSqliteAccountGameHistoryColumns\(db\)/);
});

test('SQLite schema upgrade adds only missing account history columns', () => {
    const columns = new Set(['id', 'user_id', 'mode', 'result_key']);
    const statements = [];
    const database = {
        prepare(sql) {
            assert.equal(sql, 'PRAGMA table_info(user_game_results)');
            return { all: () => [...columns].map(name => ({ name })) };
        },
        exec(sql) {
            statements.push(sql);
            const match = /ADD COLUMN ([a-z_]+)/.exec(sql);
            if (match) columns.add(match[1]);
        }
    };

    const first = ensureSqliteAccountGameHistoryColumns(database);
    const second = ensureSqliteAccountGameHistoryColumns(database);

    assert.deepEqual(first, ACCOUNT_GAME_HISTORY_COLUMNS.map(column => column.name));
    assert.deepEqual(second, []);
    assert.equal(statements.length, ACCOUNT_GAME_HISTORY_COLUMNS.length);
});

test('complete account history renders driver, duration, opponent, winner and identifiers safely', async () => {
    const { renderRecentGames } = await importController();
    const document = createDocument();
    const rendered = renderRecentGames(document, [{
        mode: 'duel',
        outcome: 'win',
        attempts: 2,
        difficulty: 'hard',
        targetDriver: { id: 'VER', name: '<Max Verstappen>' },
        durationMs: 65_000,
        roomId: 'ROOM123',
        matchId: 'ROOM123:1720000000000',
        opponentUsername: '<Rival>',
        winnerUsername: '<Narcis>',
        completedAt: '2026-07-23T12:00:00.000Z'
    }]);

    assert.equal(rendered.length, 1);
    const item = document.getElementById('authGameHistory').children[0];
    const serializedText = JSON.stringify(item);
    assert.match(serializedText, /Pilot corect: <Max Verstappen>/);
    assert.match(serializedText, /1 min 05 sec/);
    assert.match(serializedText, /Adversar: <Rival>/);
    assert.match(serializedText, /Câștigător: <Narcis>/);
    assert.match(serializedText, /Cameră: ROOM123/);
    assert.match(serializedText, /Meci: ROOM123:1720000000000/);
});

test('history controller refreshes the full account summary when the history tab opens', async () => {
    const { createAccountGameHistoryController } = await importController();
    const document = createDocument();
    const calls = [];
    const controller = createAccountGameHistoryController({
        document,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                async json() {
                    return {
                        recentGames: [{
                            mode: 'single',
                            outcome: 'loss',
                            attempts: 6,
                            difficulty: 'easy',
                            targetDriver: { name: 'Ayrton Senna' },
                            durationMs: 12_000,
                            matchId: 'single:round-1'
                        }]
                    };
                }
            };
        }
    });

    controller.setup();
    document.getElementById('authTabHistory').click();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/account/summary');
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(document.getElementById('authGameHistory').children.length, 1);
});
