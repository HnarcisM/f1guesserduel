const path = require('path');

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;
const VERSION_VALUE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const VERSIONED_EXTENSIONS = new Set(['.js', '.css']);
const STATIC_ASSET_EXTENSIONS = new Set([
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.ico',
    '.woff',
    '.woff2'
]);

function getRequestUrl(response) {
    return response?.req?.originalUrl || response?.req?.url || '';
}

function isVersionedAssetRequest(response) {
    const requestUrl = getRequestUrl(response);
    if (!requestUrl) return false;

    try {
        const version = new URL(requestUrl, 'http://localhost').searchParams.get('v');
        return typeof version === 'string' && VERSION_VALUE_PATTERN.test(version);
    } catch {
        return false;
    }
}

function setStaticCacheHeaders(response, filePath) {
    const extension = path.extname(filePath).toLowerCase();

    if (extension === '.html' || extension === '.txt') {
        response.setHeader('Cache-Control', 'no-cache');
        return;
    }

    if (VERSIONED_EXTENSIONS.has(extension)) {
        response.setHeader(
            'Cache-Control',
            isVersionedAssetRequest(response)
                ? `public, max-age=${ONE_YEAR_SECONDS}, immutable`
                : 'public, max-age=0, must-revalidate'
        );
        return;
    }

    if (STATIC_ASSET_EXTENSIONS.has(extension)) {
        response.setHeader('Cache-Control', `public, max-age=${ONE_WEEK_SECONDS}, immutable`);
    }
}

module.exports = {
    ONE_YEAR_SECONDS,
    ONE_WEEK_SECONDS,
    isVersionedAssetRequest,
    setStaticCacheHeaders
};
