const assert = require('node:assert/strict');
const test = require('node:test');

const {
    ONE_YEAR_SECONDS,
    ONE_WEEK_SECONDS,
    isVersionedAssetRequest,
    setStaticCacheHeaders
} = require('../server/middleware/staticCacheHeaders');

function createResponse(originalUrl) {
    return {
        req: { originalUrl },
        headers: {},
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        }
    };
}

test('versioned JavaScript and CSS receive immutable long-term caching', () => {
    const scriptResponse = createResponse('/game.bundle.min.js?v=frontend-bundle-2');
    const styleResponse = createResponse('/style.bundle.css?v=frontend-cache-1');

    setStaticCacheHeaders(scriptResponse, '/public/game.bundle.min.js');
    setStaticCacheHeaders(styleResponse, '/public/style.bundle.css');

    const expectedHeader = `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
    assert.equal(scriptResponse.headers['cache-control'], expectedHeader);
    assert.equal(styleResponse.headers['cache-control'], expectedHeader);
    assert.equal(isVersionedAssetRequest(scriptResponse), true);
});

test('unversioned or invalidly versioned code must revalidate', () => {
    const unversionedResponse = createResponse('/js/menuController.js');
    const invalidVersionResponse = createResponse('/game.js?v=%3Cinvalid%3E');

    setStaticCacheHeaders(unversionedResponse, '/public/js/menuController.js');
    setStaticCacheHeaders(invalidVersionResponse, '/public/game.js');

    assert.equal(
        unversionedResponse.headers['cache-control'],
        'public, max-age=0, must-revalidate'
    );
    assert.equal(
        invalidVersionResponse.headers['cache-control'],
        'public, max-age=0, must-revalidate'
    );
    assert.equal(isVersionedAssetRequest(invalidVersionResponse), false);
});

test('HTML revalidates while static image assets keep the existing one-week cache', () => {
    const htmlResponse = createResponse('/');
    const imageResponse = createResponse('/logos/F1.svg');

    setStaticCacheHeaders(htmlResponse, '/public/index.html');
    setStaticCacheHeaders(imageResponse, '/public/logos/F1.svg');

    assert.equal(htmlResponse.headers['cache-control'], 'no-cache');
    assert.equal(
        imageResponse.headers['cache-control'],
        `public, max-age=${ONE_WEEK_SECONDS}, immutable`
    );
});
