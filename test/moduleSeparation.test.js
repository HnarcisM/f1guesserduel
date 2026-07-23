const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function assertFileBudget(relativePath, maximumBytes) {
    const size = fs.statSync(path.join(projectRoot, relativePath)).size;
    assert.ok(size <= maximumBytes, `${relativePath}: ${size} bytes > ${maximumBytes} bytes`);
}

test('account frontend delegates dashboard, settings and DOM lookup responsibilities', () => {
    const authView = readProjectFile('public/js/authView.js');

    assert.match(authView, /createAccountDashboardView/);
    assert.match(authView, /createAccountSettingsController/);
    assert.match(authView, /getAuthViewElements/);
    assert.doesNotMatch(authView, /accountApi/);
    assertFileBudget('public/js/authView.js', 16_000);
    assertFileBudget('public/js/accountDashboardView.js', 13_000);
    assertFileBudget('public/js/accountSettingsController.js', 12_000);
    assertFileBudget('public/js/authViewElements.js', 7_000);
});

test('Duel socket coordinator delegates lobby, round and lifecycle events once', () => {
    const coordinator = readProjectFile('server/socket/registerSocketHandlers.js');
    const modulePaths = [
        'server/socket/duelLobbySocketHandlers.js',
        'server/socket/duelRoundSocketHandlers.js',
        'server/socket/duelLifecycleSocketHandlers.js'
    ];
    const moduleSource = modulePaths.map(readProjectFile).join('\n');
    const expectedRateLimitedEvents = [
        'requestRoomList',
        'joinRoom',
        'updateDuelLobbySettings',
        'setDuelReady',
        'selectDuelPlayer',
        'setDifficulty',
        'submitGuess',
        'timeExpired',
        'restartGame',
        'abortDuelRound',
        'refreshAuthUser'
    ];

    assert.match(coordinator, /registerDuelLobbySocketHandlers\(context\)/);
    assert.match(coordinator, /registerDuelRoundSocketHandlers\(context\)/);
    assert.match(coordinator, /registerDuelLifecycleSocketHandlers\(context\)/);
    assertFileBudget('server/socket/registerSocketHandlers.js', 5_000);
    assertFileBudget('server/socket/duelLobbySocketHandlers.js', 7_000);
    assertFileBudget('server/socket/duelRoundSocketHandlers.js', 14_000);
    assertFileBudget('server/socket/duelLifecycleSocketHandlers.js', 5_000);

    for (const eventName of expectedRateLimitedEvents) {
        const matches = moduleSource.match(new RegExp(`onSocketEvent\\('${eventName}'`, 'g')) || [];
        assert.equal(matches.length, 1, `${eventName} must be registered exactly once`);
    }
});
