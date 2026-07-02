const test = require('node:test');
const assert = require('node:assert/strict');

async function importDuelLobbyView() {
    return import(`../public/js/duelLobbyView.js?duelLobbyLeaveHandlerTest=${Date.now()}-${Math.random()}`);
}

test('Duel lobby leave button calls the provided leave-room handler', async () => {
    const { createDuelLobbyLeaveClickHandler } = await importDuelLobbyView();
    let leaveCount = 0;

    const clickHandler = createDuelLobbyLeaveClickHandler(() => {
        leaveCount += 1;
    });

    clickHandler({ preventDefault() {} });

    assert.equal(leaveCount, 1);
});

test('Duel lobby leave handler is safe when no callback is provided', async () => {
    const { createDuelLobbyLeaveClickHandler } = await importDuelLobbyView();
    const clickHandler = createDuelLobbyLeaveClickHandler(null);

    assert.doesNotThrow(() => clickHandler({ preventDefault() {} }));
});
