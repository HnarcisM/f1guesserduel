const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('one shared feedback dialog is reachable from header and account settings', () => {
    const html = read('public/index.html');

    assert.equal((html.match(/id="feedbackSettingsPanel"/g) || []).length, 1);
    assert.equal((html.match(/id="feedbackSettingsBtn"/g) || []).length, 1);
    assert.equal((html.match(/id="authFeedbackSettingsBtn"/g) || []).length, 1);
    assert.match(html, /id="feedbackSoundToggle"[^>]*role="switch"/);
    assert.match(html, /id="feedbackHapticsToggle"[^>]*role="switch"/);
    assert.match(html, /type="range"[^>]*id="feedbackSoundVolume"[^>]*max="100"/);
    assert.match(html, /type="range"[^>]*id="feedbackHapticIntensity"[^>]*max="100"/);
    assert.match(html, /\/css\/21-feedback-settings\.css\?v=[a-f0-9]{16}/);
    assert.match(html, /\/js\/feedbackController\.js\?v=[a-f0-9]{16}/);
    assert.ok(html.indexOf('/game.bundle.min.js') < html.indexOf('/js/feedbackController.js'));
});

test('guess, result and error flows use the same standalone feedback controller', () => {
    const controller = read('public/js/feedbackController.js');
    const game = read('public/game.js');

    assert.match(controller, /OUTGOING_GUESS_EVENTS/);
    assert.match(controller, /socket\.onAnyOutgoing\(outgoingHandler\)/);
    assert.match(controller, /addSocketListener\('guessResult'/);
    assert.match(controller, /addSocketListener\('dailyGuessResult'/);
    assert.match(controller, /addSocketListener\('roundResolved'/);
    assert.match(controller, /addSocketListener\('gameTimedOut'/);
    assert.match(controller, /'roomFull', 'errorMessage', 'dailyChallengeError'/);
    assert.match(controller, /f1:socket-created/);
    assert.doesNotMatch(game, /feedbackController|createFeedbackController/);
});

test('feedback implementation does not ship remote audio assets or unsafe markup', () => {
    const controller = read('public/js/feedbackController.js');
    const css = read('public/css/21-feedback-settings.css');

    assert.doesNotMatch(controller, /innerHTML|new Audio\(|fetch\(|\.mp3|\.wav|\.ogg/);
    assert.doesNotMatch(css, /url\(/);
    assert.match(controller, /AudioContext/);
    assert.match(controller, /vibrate/);
});
