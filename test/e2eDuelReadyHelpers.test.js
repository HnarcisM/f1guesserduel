const assert = require('node:assert/strict');
const test = require('node:test');

const {
    confirmDuelReady,
    startReadyDuelRound
} = require('./e2e/duelReadyE2eHelpers');

function createPage(label, events) {
    return {
        locator(selector) {
            return {
                async waitFor(options) {
                    events.push(`${label}:wait:${selector}:${options?.state || ''}`);
                },
                async click() {
                    events.push(`${label}:click:${selector}`);
                }
            };
        }
    };
}

test('confirmDuelReady waits for the control and confirms the pressed state', async () => {
    const events = [];
    const page = createPage('player', events);

    await confirmDuelReady(page, 1234);

    assert.deepEqual(events, [
        'player:wait:#duelLobbyReadyBtn:not([hidden]):not(:disabled):visible',
        'player:click:#duelLobbyReadyBtn:not([hidden]):not(:disabled)',
        'player:wait:#duelLobbyReadyBtn[aria-pressed="true"]:visible'
    ]);
});

test('startReadyDuelRound confirms both players before the host starts', async () => {
    const events = [];
    const host = createPage('host', events);
    const playerTwo = createPage('player-two', events);

    await startReadyDuelRound(host, playerTwo, 'hard', 1234);

    const hostReadyClick = events.indexOf('host:click:#duelLobbyReadyBtn:not([hidden]):not(:disabled)');
    const playerTwoReadyClick = events.indexOf('player-two:click:#duelLobbyReadyBtn:not([hidden]):not(:disabled)');
    const startClick = events.indexOf('host:click:#duelLobbyStartBtn:not(:disabled)');

    assert.ok(hostReadyClick >= 0);
    assert.ok(playerTwoReadyClick > hostReadyClick);
    assert.ok(startClick > playerTwoReadyClick);
    assert.ok(events.includes('host:click:[data-duel-lobby-level="hard"]'));
});

test('startReadyDuelRound requires both active player pages', async () => {
    await assert.rejects(
        () => startReadyDuelRound(createPage('host', []), null),
        /requires both active player pages/
    );
});
