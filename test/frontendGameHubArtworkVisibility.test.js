const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CSS_PATH = path.join(ROOT, 'public', 'css', '30-game-hub-visual-polish.css');
const MODES = [
  'classic',
  'daily',
  'era',
  'weekly',
  'speed-run',
  'streak',
  'constructor',
  'pilot-sudoku',
  'track'
];

test('normal Game Hub cards use selectors specific enough to override the legacy background shorthand', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  for (const mode of MODES) {
    const escapedMode = mode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      css,
      new RegExp(`\\.game-hub-card\\.game-mode-card\\.game-hub-card--${escapedMode}\\s*\\{[\\s\\S]*?${escapedMode}\\.webp`),
      `Selectorul explicit lipsește pentru ${mode}`
    );
  }
});

test('normal artwork is shown full-width with a readable fade instead of being hidden by the base card background', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(
    css,
    /\.game-hub-card\.game-mode-card:not\(\.game-hub-featured-card\)\s*\{[\s\S]*?background-size:\s*100% auto;/
  );
  assert.match(
    css,
    /\.game-hub-card\.game-mode-card:not\(\.game-hub-featured-card\)::before\s*\{[\s\S]*?rgba\(3, 8, 14, 0\.02\)/
  );
});

test('Duel artwork uses a separate full-width media layer instead of cover cropping', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(
    css,
    /\.game-hub-featured-card\.game-mode-card\.game-hub-card--duel\s*\{[\s\S]*?duel\.webp[\s\S]*?background-size:\s*100% 100%,\s*100% auto;/
  );
  assert.match(css, /margin-top:\s*clamp\(158px, 12vw, 190px\);/);
});
