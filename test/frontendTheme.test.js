const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.join(__dirname, '..');

function runThemeBootstrap(savedTheme) {
    const attributes = {};
    const source = fs.readFileSync(
        path.join(projectRoot, 'public', 'js', 'themeBootstrap.js'),
        'utf8'
    );
    const context = {
        localStorage: {
            getItem() {
                return savedTheme;
            }
        },
        document: {
            documentElement: {
                setAttribute(name, value) {
                    attributes[name] = value;
                }
            }
        }
    };

    vm.runInNewContext(source, context);
    return attributes;
}

test('theme bootstrap applies a valid saved theme before the stylesheet is parsed', () => {
    const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
    const bootstrapPosition = html.indexOf('/js/themeBootstrap.js?v=theme-bootstrap-1');
    const stylesheetPosition = html.indexOf('/style.bundle.css?v=frontend-cache-1');
    const socketPosition = html.indexOf('/socket.io/socket.io.js');
    const gamePosition = html.indexOf('/game.bundle.min.js?v=frontend-bundle-1');

    assert.ok(bootstrapPosition > 0);
    assert.ok(bootstrapPosition < stylesheetPosition);
    assert.ok(socketPosition > html.indexOf('<body'));
    assert.ok(socketPosition < gamePosition);
    assert.equal(runThemeBootstrap('carbon')['data-app-theme'], 'carbon');
});

test('theme bootstrap rejects unknown localStorage values', () => {
    assert.equal(runThemeBootstrap('unknown-theme')['data-app-theme'], 'default');
    assert.equal(runThemeBootstrap(null)['data-app-theme'], 'default');
});

test('theme controller normalizes values and applies the theme to the document root', async t => {
    const originalDocument = globalThis.document;
    const rootAttributes = {};
    let removedBodyAttribute = null;
    globalThis.document = {
        documentElement: {
            setAttribute(name, value) {
                rootAttributes[name] = value;
            }
        },
        body: {
            removeAttribute(name) {
                removedBodyAttribute = name;
            }
        }
    };
    t.after(() => {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    });

    const { applyTheme, normalizeTheme } = await import('../public/js/themeMenuController.js');

    assert.equal(normalizeTheme('neon'), 'neon');
    assert.equal(normalizeTheme('invalid'), 'default');
    assert.equal(applyTheme('carbon'), 'carbon');
    assert.equal(rootAttributes['data-app-theme'], 'carbon');
    assert.equal(removedBodyAttribute, 'data-app-theme');
});
