const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const CSS_PATH = path.join(ROOT, 'public', 'css', '30-game-hub-visual-polish.css');
const INDEX_PATH = path.join(ROOT, 'public', 'index.html');
const VERSION_PATH = path.join(ROOT, 'scripts', 'version-frontend-assets.js');
const ART_DIR = path.join(ROOT, 'public', 'images', 'game-hub');
const ARTWORK = [
  'classic.svg', 'daily.svg', 'era.svg', 'weekly.svg', 'speed-run.svg',
  'streak.svg', 'constructor.svg', 'pilot-sudoku.svg', 'track.svg', 'duel.svg'
];

test('Game Hub loads the compact visual polish stylesheet after the dashboard stylesheet', () => {
  const index = fs.readFileSync(INDEX_PATH, 'utf8');
  const dashboardIndex = index.indexOf('/css/29-game-hub-dashboard.css');
  const polishIndex = index.indexOf('/css/30-game-hub-visual-polish.css');
  assert.ok(dashboardIndex >= 0);
  assert.ok(polishIndex > dashboardIndex);
});

test('Game Hub polish contains compact desktop rules and real artwork references', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /game-hub-panel--specialty[\s\S]*min-height:\s*148px/);
  assert.match(css, /game-hub-featured-card\.game-mode-card[\s\S]*min-height:\s*548px/);
  assert.match(css, /@media \(min-width: 1181px\) and \(max-height: 900px\)/);
  assert.match(css, /game-mode-selection\.game-hub[\s\S]*max-width:\s*none/);
  for (const fileName of ARTWORK) {
    assert.ok(css.includes(`/images/game-hub/${fileName}`), `Lipsește referința CSS pentru ${fileName}`);
  }
});

test('all Game Hub artwork files are local valid SVG assets and are precached', () => {
  const versioning = fs.readFileSync(VERSION_PATH, 'utf8');
  for (const fileName of ARTWORK) {
    const filePath = path.join(ART_DIR, fileName);
    assert.ok(fs.existsSync(filePath), `Lipsește ${fileName}`);
    const svg = fs.readFileSync(filePath, 'utf8');
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /viewBox="0 0 640 260"/);
    assert.ok(versioning.includes(`/images/game-hub/${fileName}`), `${fileName} nu este în precache`);
  }
  assert.ok(versioning.includes("publicPath: '/css/30-game-hub-visual-polish.css'"));
});
