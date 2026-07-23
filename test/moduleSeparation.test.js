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
        'server/socket/duelMatchSocketHandlers.js',
        'server/socket/duelRoundSocketHandlers.js',
        'server/socket/duelLifecycleSocketHandlers.js'
    ];
    const moduleSource = modulePaths.map(readProjectFile).join('\n');
    const expectedRateLimitedEvents = [
        'requestRoomList',
        'joinRoom',
        'updateDuelLobbySettings',
        'setDuelReady',
        'resetDuelMatch',
        'selectDuelPlayer',
        'setDifficulty',
        'submitGuess',
        'timeExpired',
        'restartGame',
        'abortDuelRound',
        'refreshAuthUser'
    ];

    assert.match(coordinator, /registerDuelLobbySocketHandlers\(context\)/);
    assert.match(coordinator, /registerDuelMatchSocketHandlers\(context\)/);
    assert.match(coordinator, /registerDuelRoundSocketHandlers\(context\)/);
    assert.match(coordinator, /registerDuelLifecycleSocketHandlers\(context\)/);
    assertFileBudget('server/socket/registerSocketHandlers.js', 5_000);
    assertFileBudget('server/socket/duelLobbySocketHandlers.js', 7_100);
    assertFileBudget('server/socket/duelMatchSocketHandlers.js', 2_500);
    assertFileBudget('server/socket/duelRoundSocketHandlers.js', 14_000);
    assertFileBudget('server/socket/duelLifecycleSocketHandlers.js', 5_000);

    for (const eventName of expectedRateLimitedEvents) {
        const matches = moduleSource.match(new RegExp(`onSocketEvent\\('${eventName}'`, 'g')) || [];
        assert.equal(matches.length, 1, `${eventName} must be registered exactly once`);
    }
});

test('Duel match state stays isolated from general room orchestration', () => {
    const roomService = readProjectFile('server/rooms/roomService.js');

    assert.match(roomService, /require\('\.\/duelMatchService'\)/);
    assertFileBudget('server/rooms/duelMatchService.js', 7_000);
    assertFileBudget('public/js/duelSeriesController.js', 13_000);
});


test('Duel round history stays isolated and uses safe DOM rendering', () => {
    const roundResultService = readProjectFile('server/rooms/roundResultService.js');
    const historyService = readProjectFile('server/rooms/roundHistoryService.js');
    const historyController = readProjectFile('public/js/duelRoundHistoryController.js');

    assert.match(roundResultService, /require\('\.\/roundHistoryService'\)/);
    assert.match(historyService, /MAX_DUEL_ROUND_HISTORY = 10/);
    assert.doesNotMatch(historyController, /innerHTML/);
    assertFileBudget('server/rooms/roundHistoryService.js', 10_000);
    assertFileBudget('public/js/duelRoundHistoryController.js', 9_000);
});


test('complete account history stays isolated and renders without innerHTML', () => {
    const controller = readProjectFile('public/js/accountGameHistoryController.js');
    const sqliteUpgrade = readProjectFile('server/db/sqliteSchemaUpgrade.js');

    assert.doesNotMatch(controller, /innerHTML/);
    assert.match(sqliteUpgrade, /ALTER TABLE user_game_results ADD COLUMN/);
    assertFileBudget('public/js/accountGameHistoryController.js', 13_000);
    assertFileBudget('server/db/sqliteSchemaUpgrade.js', 4_000);
});
