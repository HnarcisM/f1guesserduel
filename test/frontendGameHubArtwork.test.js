const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CSS_PATH = path.join(ROOT, 'public', 'css', '30-game-hub-visual-polish.css');
const MODE_NAMES = [
  'classic',
  'daily',
  'era',
  'weekly',
  'speed-run',
  'streak',
  'constructor',
  'pilot-sudoku',
  'track',
  'duel'
];

test('Game Hub uses integrated WebP artwork for every mode', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  for (const modeName of MODE_NAMES) {
    assert.match(css, new RegExp(`/images/game-hub/${modeName}\\.webp`));
    const imagePath = path.join(ROOT, 'public', 'images', 'game-hub', `${modeName}.webp`);
    assert.equal(fs.existsSync(imagePath), true, `${modeName}.webp lipsește`);
    const bytes = fs.readFileSync(imagePath);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
    assert.ok(bytes.length < 160_000, `${modeName}.webp este prea mare: ${bytes.length} bytes`);
  }
});

test('mode artwork is integrated behind content instead of rendered as a separate thumbnail', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /\.game-hub-card-art\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.game-hub-card-chrome\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*2;/);
  assert.match(css, /\.game-hub-card\.game-mode-card::before\s*\{[\s\S]*?linear-gradient/);
  assert.match(css, /\.game-hub-featured-card\.game-mode-card\s*\{[\s\S]*?duel\.webp/);
});

test('Game Hub remains compact across desktop and short laptop viewports', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /min-height:\s*206px;/);
  assert.match(css, /min-height:\s*154px;/);
  assert.match(css, /min-height:\s*532px;/);
  assert.match(css, /@media \(min-width: 1181px\) and \(max-height: 900px\)/);
  assert.match(css, /min-height:\s*122px;/);
  assert.match(css, /min-height:\s*474px;/);
});
