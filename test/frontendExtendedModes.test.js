const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const autocomplete = read('public/js/extendedModeAutocomplete.js');
const controller = read('public/js/extendedModesController.js');
const weeklyView = read('public/js/weeklyChallengeView.js');
const extendedConfig = read('public/js/extendedModesConfig.js');
const styles = read('public/css/24-extended-modes.css');
const pageStyles = read('public/css/25-mode-pages.css');
const hub = read('public/js/gameHubController.js');
const pageController = read('public/js/extendedModePage.js');
const registry = read('public/js/gameVariantRegistry.js');
const socketHandlers = read('server/socket/extendedModesSocketHandlers.js');
const weeklyCoordinator = read('server/socket/weeklyChallengeCoordinator.js');
const coordinator = read('server/socket/registerSocketHandlers.js');

test('every extended mode is enabled and launches through an isolated page route', () => {
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
    assert.equal((registry.match(/pagePath: '\/modes\//g) || []).length, 7);
    assert.match(hub, /dataset\.gameModePage/);
    assert.doesNotMatch(hub, /extendedModesController|startExtendedMode|dynamic import|import\(/);
    assert.match(pageController, /createExtendedModesController/);
    assert.match(controller, /startExtendedMode/);
    assert.match(registry, /key: 'weekly'[\s\S]*requiresAccount: true/);
    assert.match(extendedConfig, /O încercare oficială pe săptămână/);
});

test('frontend listens to the complete server-authoritative extended-mode protocol', () => {
    for (const eventName of [
        'extendedModeStarted',
        'extendedGuessResult',
        'extendedRoundResult',
        'extendedRoundReady',
        'extendedSudokuUpdate',
        'extendedModeFinished',
        'extendedModeError',
        'weeklyChallengeStatus'
    ]) {
        assert.match(controller, new RegExp(eventName));
    }
    for (const eventName of [
        'submitExtendedGuess',
        'continueExtendedMode',
        'skipExtendedRound',
        'submitExtendedSudokuGuess',
        'restartExtendedMode',
        'leaveExtendedMode',
        'requestWeeklyChallengeStatus'
    ]) {
        assert.match(controller, new RegExp(eventName));
        assert.match(`${socketHandlers}
${weeklyCoordinator}`, new RegExp(`'${eventName}'`));
    }
    assert.match(weeklyCoordinator, /claimWeeklyChallenge/);
    assert.match(weeklyCoordinator, /completeWeeklyChallenge/);
});

test('new modes remain isolated from classic game orchestration', () => {
    const game = read('public/game.js');
    assert.doesNotMatch(game, /extendedModesController|startExtendedMode|Pilot Sudoku|Speed Run/);
    assert.doesNotMatch(pageController, /game\.bundle\.min\.js|gameModeSelectionController|startSingleGame/);
    assert.match(pageController, /refreshAuthUser/);
    assert.match(coordinator, /registerExtendedModesSocketHandlers/);
    assert.match(coordinator, /extendedSessions/);
});

test('track, Sudoku and responsive layouts have dedicated accessible UI', () => {
    assert.match(controller, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg'/);
    assert.match(controller, /role', 'grid'/);
    assert.match(controller, /aria-modal/);
    assert.match(pageController, /removeAttribute\('aria-modal'\)/);
    assert.match(controller, /aria-live/);
    assert.match(styles, /\.extended-sudoku-grid/);
    assert.match(styles, /\.extended-mode-hud/);
    assert.match(styles, /\.extended-weekly-grid/);
    assert.match(weeklyView, /WEEKLY_DIFFICULTY_OPTIONS/);
    assert.match(weeklyView, /formatWeeklyCountdown/);
    assert.match(styles, /@media \(max-width: 680px\)/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('extended mode pages place the guess form directly below the title area', () => {
    assert.match(pageController, /function placeGuessControlsAfterTitle/);
    assert.match(pageController, /game\.insertBefore\(guessArea, game\.firstElementChild\)/);
    assert.match(pageController, /game\.insertBefore\(status, guessArea\.nextSibling\)/);
    assert.match(pageController, /placeGuessControlsAfterTitle\(controller\)/);
    assert.match(controller, /id="extendedGuessArea"[\s\S]*?id="extendedSubmitGuess"/);
    assert.doesNotMatch(styles, /\.extended-guess-area\s*\{[^}]*order\s*:/);
});

test('Carbon extended submit button matches the Classic grey action palette', () => {
    assert.match(controller, /id="extendedSubmitGuess" class="extended-primary-btn"/);
    assert.match(
        pageStyles,
        /\[data-app-theme="carbon"\]\s+#extendedSubmitGuess\s*\{[\s\S]*?linear-gradient\(180deg,\s*#5f6368\s+0%,\s*#3f4347\s+100%\)[\s\S]*?border:\s*1px\s+solid\s+#7a7f85/
    );
    assert.match(
        pageStyles,
        /#extendedSubmitGuess:hover:not\(:disabled\)[\s\S]*?#extendedSubmitGuess:focus-visible:not\(:disabled\)[\s\S]*?linear-gradient\(180deg,\s*#6f747a\s+0%,\s*#4b5055\s+100%\)/
    );
    assert.match(
        pageStyles,
        /#extendedSubmitGuess:active:not\(:disabled\)[\s\S]*?linear-gradient\(180deg,\s*#3c4044\s+0%,\s*#303337\s+100%\)/
    );
    assert.doesNotMatch(pageStyles, /\[data-app-theme="carbon"\]\s+\.extended-primary-btn/);
});

test('extended autocomplete mirrors Classic keyboard selection and entity visuals', () => {
    const autocompleteStyles = read('public/css/28-extended-mode-autocomplete.css');
    assert.match(controller, /createExtendedModeAutocomplete/);
    assert.match(controller, /autocomplete\.renderSuggestions/);
    assert.match(controller, /autocomplete\.handleKeydown/);
    assert.match(autocomplete, /ArrowDown/);
    assert.match(autocomplete, /ArrowUp/);
    assert.match(autocomplete, /aria-activedescendant/);
    assert.match(autocomplete, /getLocalTeamLogoPath/);
    assert.match(autocomplete, /getIsoCode/);
    assert.match(autocompleteStyles, /var\(--surface-card/);
    assert.doesNotMatch(autocompleteStyles, /surface-elevated/);
    assert.match(autocompleteStyles, /\.extended-suggestion\.is-active/);
    assert.match(autocompleteStyles, /\.extended-suggestion-visual\.is-logo/);
});

test('non-timed modes do not interpret a null deadline as an expired timer', () => {
    assert.match(controller, /rawExpiresAt === null \|\| rawExpiresAt === undefined/);
    assert.match(controller, /current\.expiresAt !== null/);
});

test('extended mode modules stay within maintainable size budgets', () => {
    const budgets = {
        'public/js/extendedModeAutocomplete.js': 9_000,
        'public/js/extendedModesController.js': 40_000,
        'public/css/24-extended-modes.css': 16_000,
        'public/js/weeklyChallengeView.js': 6_000,
        'public/js/extendedModesConfig.js': 3_000,
        'public/js/extendedModePage.js': 9_000,
        'public/js/extendedModeHeaderController.js': 6_000,
        'public/js/extendedModeShell.js': 6_000,
        'public/js/extendedModeShellMarkup.js': 26_000,
        'public/css/25-mode-pages.css': 8_000,
        'public/css/28-extended-mode-autocomplete.css': 4_000,
        'server/game/extendedModesService.js': 40_000,
        'server/game/extendedModesCatalogs.js': 12_000,
        'server/socket/extendedModesSocketHandlers.js': 13_000,
        'server/socket/extendedModesSocketPayloads.js': 2_000,
        'server/socket/weeklyChallengeCoordinator.js': 7_000
    };
    for (const [relativePath, maximumBytes] of Object.entries(budgets)) {
        const size = fs.statSync(path.join(root, relativePath)).size;
        assert.ok(size <= maximumBytes, `${relativePath}: ${size} bytes > ${maximumBytes} bytes`);
    }
});
