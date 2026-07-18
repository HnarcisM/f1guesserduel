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

test('team logo mapping prefers optimized WebP and keeps larger originals', async () => {
    const { getLocalTeamLogoPath } = await import('../public/js/assets.js');

    assert.equal(getLocalTeamLogoPath('Ferrari'), '/logos/Ferrari.webp');
    assert.equal(getLocalTeamLogoPath('Brawn GP'), '/logos/BrawnGP.jpg');
    assert.equal(getLocalTeamLogoPath('Unknown Team'), null);
});

test('flag fallback stays local and disables further error handling', async () => {
    const { handleFlagError } = await import('../public/js/assets.js');
    const image = createImageStub();

    handleFlagError(image, 'gb', 0);

    assert.equal(image.src, '/flags/un.svg');
    assert.equal(image.onerror, null);
    assert.equal(/^https?:\/\//.test(image.src), false);
});
