'use strict';

const CACHE_PREFIX = 'f1-guesser-static-';
/* GENERATED_PRECACHE_START */
const STATIC_CACHE_NAME = 'f1-guesser-static-df1efdf75f99ea7da874';
const PRECACHE_URLS = Object.freeze([
    "/css/16-duel-ready.css?v=325c0498b808b8c1",
    "/css/17-duel-series.css?v=519233effd931ef4",
    "/css/18-duel-round-history.css?v=2d04b48dd080faa8",
    "/css/19-account-game-history.css?v=cc05ef00b611d229",
    "/css/20-duel-identity.css?v=884e3a5bec345dbb",
    "/css/21-feedback-settings.css?v=be4013981c050ad8",
    "/css/22-connection-status.css?v=a05172cdad41910e",
    "/css/23-game-hub.css?v=7ecca81778fc1131",
    "/css/24-extended-modes.css",
    "/css/25-mode-pages.css",
    "/css/26-runtime-status.css",
    "/css/26-runtime-status.css?v=9e36b3f6d4da0032",
    "/game.bundle.min.js?v=58124a83dd554db3",
    "/icons/pwa-192.png",
    "/icons/pwa-512.png",
    "/index.html",
    "/js/accountGameHistoryController.js?v=0bdff1b6f186805c",
    "/js/apiClient.js",
    "/js/connectionStatusController.js?v=6df8af4e1cbae20a",
    "/js/duelIdentityController.js?v=1345c7e6d7940860",
    "/js/duelReadyController.js?v=29b02568a275c131",
    "/js/duelRoomBrowserSeriesController.js?v=ebbf9dd31662abb2",
    "/js/duelRoundHistoryController.js?v=77fa53fbfa13103a",
    "/js/duelSeriesController.js?v=14bfad7705c45b6d",
    "/js/extendedModeHeaderController.js",
    "/js/extendedModePage.js",
    "/js/extendedModesConfig.js",
    "/js/extendedModesController.js",
    "/js/feedbackController.js?v=5cd6b13e762a05bd",
    "/js/gameHubController.js?v=4f6b8e20472d65b3",
    "/js/gameVariantRegistry.js?v=ad37d1ad96dccbd0",
    "/js/modes/constructorPage.js",
    "/js/modes/eraPage.js",
    "/js/modes/pilotSudokuPage.js",
    "/js/modes/speedRunPage.js",
    "/js/modes/streakPage.js",
    "/js/modes/trackPage.js",
    "/js/modes/weeklyPage.js",
    "/js/pwaController.js?v=a28eba69df98be12",
    "/js/runtimeExperienceController.js",
    "/js/runtimeExperienceController.js?v=b3f5d64959795f47",
    "/js/socketBridgeBootstrap.js?v=fd76646cd8126930",
    "/js/themeBootstrap.js?v=6afc6a3773845bb4",
    "/js/weeklyChallengeView.js",
    "/manifest.webmanifest?v=e0da31a997a94e9f",
    "/modes/constructor/",
    "/modes/era/",
    "/modes/pilot-sudoku/",
    "/modes/speed-run/",
    "/modes/streak/",
    "/modes/track/",
    "/modes/weekly/",
    "/style.bundle.css?v=9b31ae015af3c57e",
]);
/* GENERATED_PRECACHE_END */

const NETWORK_ONLY_PREFIXES = Object.freeze([
    '/api',
    '/socket.io'
]);
const NETWORK_ONLY_PATHS = new Set(['/metrics']);
const STATIC_ASSET_EXTENSION_PATTERN = /\.(?:css|js|mjs|png|jpe?g|webp|gif|svg|ico|woff2?|webmanifest)$/i;

function normalizePathname(pathname = '/') {
    const normalized = String(pathname || '/');
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function isNetworkOnlyPath(pathname) {
    const normalized = normalizePathname(pathname);
    if (NETWORK_ONLY_PATHS.has(normalized)) return true;
    return NETWORK_ONLY_PREFIXES.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function isStaticAssetPath(pathname) {
    return STATIC_ASSET_EXTENSION_PATTERN.test(normalizePathname(pathname));
}

function canCacheResponse(response) {
    if (!response?.ok) return false;
    if (!['basic', 'default'].includes(response.type)) return false;
    const cacheControl = response.headers?.get?.('cache-control') || '';
    return !/\bno-store\b/i.test(cacheControl);
}

async function cacheFirstStatic(request, { cachesObject = caches, fetchFn = fetch } = {}) {
    const cache = await cachesObject.open(STATIC_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetchFn(request);
    if (canCacheResponse(response)) await cache.put(request, response.clone());
    return response;
}

async function networkFirstNavigation(request, { cachesObject = caches, fetchFn = fetch } = {}) {
    try {
        return await fetchFn(request);
    } catch (error) {
        const cache = await cachesObject.open(STATIC_CACHE_NAME);
        const requestUrl = new URL(request.url);
        const pageFallback = await cache.match(requestUrl.pathname);
        if (pageFallback) return pageFallback;
        const appFallback = await cache.match('/index.html');
        if (appFallback) return appFallback;
        throw error;
    }
}

async function installStaticCache({
    cachesObject = caches,
    fetchFn = fetch
} = {}) {
    const cache = await cachesObject.open(STATIC_CACHE_NAME);
    await Promise.all(PRECACHE_URLS.map(async url => {
        const response = await fetchFn(url, {
            cache: 'reload',
            credentials: 'same-origin'
        });
        if (!canCacheResponse(response)) {
            throw new Error(`Precache request failed: ${url}`);
        }
        await cache.put(url, response);
    }));
}

async function removeOldStaticCaches({ cachesObject = caches } = {}) {
    const cacheNames = await cachesObject.keys();
    await Promise.all(cacheNames
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== STATIC_CACHE_NAME)
        .map(name => cachesObject.delete(name)));
}

function handleFetchEvent(event, {
    scopeOrigin = typeof self !== 'undefined' ? self.location.origin : '',
    cachesObject = caches,
    fetchFn = fetch
} = {}) {
    const request = event?.request;
    if (!request || request.method !== 'GET') return false;

    const url = new URL(request.url);
    if (url.origin !== scopeOrigin || isNetworkOnlyPath(url.pathname)) return false;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirstNavigation(request, { cachesObject, fetchFn }));
        return true;
    }

    if (!isStaticAssetPath(url.pathname)) return false;
    event.respondWith(cacheFirstStatic(request, { cachesObject, fetchFn }));
    return true;
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
    self.addEventListener('install', event => {
        event.waitUntil(installStaticCache().then(() => self.skipWaiting()));
    });

    self.addEventListener('activate', event => {
        event.waitUntil(removeOldStaticCaches().then(() => self.clients.claim()));
    });

    self.addEventListener('fetch', event => {
        handleFetchEvent(event);
    });
}

if (typeof module !== 'undefined') {
    module.exports = {
        CACHE_PREFIX,
        STATIC_CACHE_NAME,
        NETWORK_ONLY_PATHS,
        NETWORK_ONLY_PREFIXES,
        STATIC_ASSET_EXTENSION_PATTERN,
        canCacheResponse,
        cacheFirstStatic,
        handleFetchEvent,
        installStaticCache,
        isNetworkOnlyPath,
        isStaticAssetPath,
        networkFirstNavigation,
        normalizePathname,
        removeOldStaticCaches
    };
}
