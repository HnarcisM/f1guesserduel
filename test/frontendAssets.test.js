const test = require('node:test');
const assert = require('node:assert/strict');

function createImageStub() {
    return {
        onerror: () => {},
        src: ''
    };
}

test('team logo fallback stays local and disables further error handling', async () => {
    const { handleTeamLogoError } = await import('../public/js/assets.js');
    const image = createImageStub();

    handleTeamLogoError(image, 'Ferrari', 0);

    assert.equal(image.src, '/logos/F1.svg');
    assert.equal(image.onerror, null);
    assert.equal(/^https?:\/\//.test(image.src), false);
});

test('flag fallback stays local and disables further error handling', async () => {
    const { handleFlagError } = await import('../public/js/assets.js');
    const image = createImageStub();

    handleFlagError(image, 'gb', 0);

    assert.equal(image.src, '/flags/un.svg');
    assert.equal(image.onerror, null);
    assert.equal(/^https?:\/\//.test(image.src), false);
});
