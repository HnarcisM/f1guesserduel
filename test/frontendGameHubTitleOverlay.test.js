const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CSS_PATH = path.join(ROOT, 'public', 'css', '30-game-hub-visual-polish.css');

test('Game Hub title overlays artwork while supporting copy remains below it', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');

  assert.match(css, /GAME_HUB_TITLE_OVERLAY_FIX_START/);
  assert.match(css, /\.game-hub-card-art\s*\{[\s\S]*?display:\s*block;[\s\S]*?aspect-ratio:\s*16\s*\/\s*9;/);
  assert.match(css, /\.game-hub-card-title\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?translateY\(calc\(-100%\s*-\s*8px\)\)/);
  assert.match(css, /\.game-hub-card-content\s*\{[\s\S]*?padding:\s*9px\s+10px\s+10px;[\s\S]*?background:\s*#07101a;/);
  assert.match(css, /\.game-hub-card-description\s*\{[\s\S]*?text-shadow:\s*none;/);
});

test('every normal mode maps its image to the artwork layer', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  for (const mode of ['classic', 'daily', 'era', 'weekly', 'speed-run', 'streak', 'constructor', 'pilot-sudoku', 'track']) {
    assert.match(
      css,
      new RegExp(`game-hub-card--${mode} \\.game-hub-card-art \\{[\\s\\S]*?${mode}\\.webp`),
      `Lipsește maparea artwork pentru ${mode}`
    );
  }
});

test('Duel CTA is centered', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /\.game-hub-featured-cta\s*\{[\s\S]*?justify-self:\s*center;[\s\S]*?align-self:\s*center;[\s\S]*?margin-inline:\s*auto;/);
});
