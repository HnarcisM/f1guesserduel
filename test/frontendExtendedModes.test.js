const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const controller = read('public/js/extendedModesController.js');
const styles = read('public/css/24-extended-modes.css');
const hub = read('public/js/gameHubController.js');
const registry = read('public/js/gameVariantRegistry.js');
const socketHandlers = read('server/socket/extendedModesSocketHandlers.js');
const coordinator = read('server/socket/registerSocketHandlers.js');

test('every extended mode is enabled and launches through the isolated controller', () => {
    for (const variantKey of [
        'speed-run',
        'era',
        'streak',
        'weekly',
        'constructor',
        'pilot-sudoku',
        'track'
    ]) {
        assert.match(registry, new RegExp(`key: '${variantKey}'`));
    }
    assert.equal((registry.match(/launchType: 'extended'/g) || []).length, 7);
    assert.match(hub, /data\.extendedModeChoice|dataset\.extendedModeChoice/);
    assert.match(hub, /import\(EXTENDED_MODES_MODULE_URL\)/);
    assert.match(controller, /startExtendedMode/);
});

test('frontend listens to the complete server-authoritative extended-mode protocol', () => {
    for (const eventName of [
        'extendedModeStarted',
        'extendedGuessResult',
        'extendedRoundResult',
        'extendedRoundReady',
        'extendedSudokuUpdate',
        'extendedModeFinished',
        'extendedModeError'
    ]) {
        assert.match(controller, new RegExp(eventName));
    }
    for (const eventName of [
        'submitExtendedGuess',
        'continueExtendedMode',
        'skipExtendedRound',
        'submitExtendedSudokuGuess',
        'restartExtendedMode',
        'leaveExtendedMode'
    ]) {
        assert.match(controller, new RegExp(eventName));
        assert.match(socketHandlers, new RegExp(`'${eventName}'`));
    }
});

test('new modes remain isolated from classic game orchestration', () => {
    const game = read('public/game.js');
    assert.doesNotMatch(game, /extendedModesController|startExtendedMode|Pilot Sudoku|Speed Run/);
    assert.match(coordinator, /registerExtendedModesSocketHandlers/);
    assert.match(coordinator, /extendedSessions/);
});

test('track, Sudoku and responsive layouts have dedicated accessible UI', () => {
    assert.match(controller, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg'/);
    assert.match(controller, /role', 'grid'/);
    assert.match(controller, /aria-modal/);
    assert.match(controller, /aria-live/);
    assert.match(styles, /\.extended-sudoku-grid/);
    assert.match(styles, /\.extended-mode-hud/);
    assert.match(styles, /@media \(max-width: 680px\)/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('non-timed modes do not interpret a null deadline as an expired timer', () => {
    assert.match(controller, /rawExpiresAt === null \|\| rawExpiresAt === undefined/);
    assert.match(controller, /current\.expiresAt !== null/);
});

test('extended mode modules stay within maintainable size budgets', () => {
    const budgets = {
        'public/js/extendedModesController.js': 40_000,
        'public/css/24-extended-modes.css': 15_000,
        'server/game/extendedModesService.js': 40_000,
        'server/game/extendedModesCatalogs.js': 12_000,
        'server/socket/extendedModesSocketHandlers.js': 13_000
    };
    for (const [relativePath, maximumBytes] of Object.entries(budgets)) {
        const size = fs.statSync(path.join(root, relativePath)).size;
        assert.ok(size <= maximumBytes, `${relativePath}: ${size} bytes > ${maximumBytes} bytes`);
    }
});
