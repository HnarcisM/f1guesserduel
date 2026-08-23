const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_INDEX_FILE = path.join('public', 'index.html');
const DEFAULT_SERVICE_WORKER_FILE = path.join('public', 'service-worker.js');
const SERVICE_WORKER_PRECACHE_START = '/* GENERATED_PRECACHE_START */';
const SERVICE_WORKER_PRECACHE_END = '/* GENERATED_PRECACHE_END */';
const DEFAULT_PRECACHE_STATIC_URLS = Object.freeze([
    '/index.html',
    '/icons/pwa-192.png',
    '/icons/pwa-512.png',
    '/css/01-theme-tokens.css',
    '/css/02-header-menu.css',
    '/css/08-auth.css',
    '/css/11-mobile-layout-fix.css',
    '/css/13-progress-values.css',
    '/css/14-auth-panel-viewport-fix.css',
    '/css/19-account-game-history.css',
    '/css/21-feedback-settings.css',
    '/css/24-extended-modes.css',
    '/css/25-mode-pages.css',
    '/css/26-runtime-status.css',
    '/css/27-extended-mode-legend.css',
    '/css/28-extended-mode-autocomplete.css',
    '/js/accountDashboardView.js',
    '/js/accountGameHistoryController.js',
    '/js/accountSettingsController.js',
    '/js/apiClient.js',
    '/js/assets.js',
    '/js/authView.js',
    '/js/authViewElements.js',
    '/js/constants.js',
    '/js/dialogFocusManager.js',
    '/js/extendedModesConfig.js',
    '/js/extendedComparisonBoard.js',
    '/js/extendedModeAutocomplete.js',
    '/js/extendedModesController.js',
    '/js/extendedModePage.js',
    '/js/extendedModeHeaderController.js',
    '/js/extendedModeShellMarkup.js',
    '/js/extendedModeShell.js',
    '/js/navigationMenuController.js',
    '/js/progressStyle.js',
    '/js/runtimeExperienceController.js',
    '/js/themeMenuController.js',
    '/js/weeklyChallengeView.js',
    '/js/modes/speedRunPage.js',
    '/js/modes/eraPage.js',
    '/js/modes/streakPage.js',
    '/js/modes/weeklyPage.js',
    '/js/modes/constructorPage.js',
    '/js/modes/pilotSudokuPage.js',
    '/js/modes/trackPage.js',
    '/modes/speed-run/',
    '/modes/era/',
    '/modes/streak/',
    '/modes/weekly/',
    '/modes/constructor/',
    '/modes/pilot-sudoku/',
    '/modes/track/',
]);
const DEFAULT_ASSETS = Object.freeze([
    {
        attribute: 'href',
        publicPath: '/manifest.webmanifest',
        sourceFile: path.join('public', 'manifest.webmanifest')
    },
    {
        attribute: 'src',
        publicPath: '/js/themeBootstrap.js',
        sourceFile: path.join('public', 'js', 'themeBootstrap.js')
    },
    {
        attribute: 'href',
        publicPath: '/css/02-header-menu.css',
        sourceFile: path.join('public', 'css', '02-header-menu.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/08-auth.css',
        sourceFile: path.join('public', 'css', '08-auth.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/11-mobile-layout-fix.css',
        sourceFile: path.join('public', 'css', '11-mobile-layout-fix.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/14-auth-panel-viewport-fix.css',
        sourceFile: path.join('public', 'css', '14-auth-panel-viewport-fix.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/16-duel-ready.css',
        sourceFile: path.join('public', 'css', '16-duel-ready.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/17-duel-series.css',
        sourceFile: path.join('public', 'css', '17-duel-series.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/18-duel-round-history.css',
        sourceFile: path.join('public', 'css', '18-duel-round-history.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/19-account-game-history.css',
        sourceFile: path.join('public', 'css', '19-account-game-history.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/20-duel-identity.css',
        sourceFile: path.join('public', 'css', '20-duel-identity.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/21-feedback-settings.css',
        sourceFile: path.join('public', 'css', '21-feedback-settings.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/22-connection-status.css',
        sourceFile: path.join('public', 'css', '22-connection-status.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/23-game-hub.css',
        sourceFile: path.join('public', 'css', '23-game-hub.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/29-game-hub-dashboard.css',
        sourceFile: path.join('public', 'css', '29-game-hub-dashboard.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/30-game-hub-visual-polish.css',
        sourceFile: path.join('public', 'css', '30-game-hub-visual-polish.css')
    },
    {
        attribute: 'href',
        publicPath: '/css/26-runtime-status.css',
        sourceFile: path.join('public', 'css', '26-runtime-status.css')
    },
    {
        attribute: 'src',
        publicPath: '/js/socketBridgeBootstrap.js',
        sourceFile: path.join('public', 'js', 'socketBridgeBootstrap.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/gameVariantRegistry.js',
        sourceFile: path.join('public', 'js', 'gameVariantRegistry.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/gameHubDashboardView.js',
        sourceFile: path.join('public', 'js', 'gameHubDashboardView.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/runtimeExperienceController.js',
        sourceFile: path.join('public', 'js', 'runtimeExperienceController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/gameHubController.js',
        sourceFile: path.join('public', 'js', 'gameHubController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/duelReadyController.js',
        sourceFile: path.join('public', 'js', 'duelReadyController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/duelSeriesController.js',
        sourceFile: path.join('public', 'js', 'duelSeriesController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/duelRoundHistoryController.js',
        sourceFile: path.join('public', 'js', 'duelRoundHistoryController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/accountGameHistoryController.js',
        sourceFile: path.join('public', 'js', 'accountGameHistoryController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/duelRoomBrowserSeriesController.js',
        sourceFile: path.join('public', 'js', 'duelRoomBrowserSeriesController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/duelIdentityController.js',
        sourceFile: path.join('public', 'js', 'duelIdentityController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/feedbackController.js',
        sourceFile: path.join('public', 'js', 'feedbackController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/connectionStatusController.js',
        sourceFile: path.join('public', 'js', 'connectionStatusController.js')
    },
    {
        attribute: 'src',
        publicPath: '/js/pwaController.js',
        sourceFile: path.join('public', 'js', 'pwaController.js')
    },
    {
        attribute: 'href',
        publicPath: '/style.bundle.css',
        sourceFile: path.join('public', 'style.bundle.css')
    },
    {
        attribute: 'src',
        publicPath: '/game.bundle.min.js',
        sourceFile: path.join('public', 'game.bundle.min.js')
    }
]);
const TEXT_STATIC_ASSET_EXTENSIONS = new Set([
    '.css',
    '.html',
    '.js',
    '.json',
    '.mjs',
    '.svg',
    '.txt',
    '.webmanifest'
]);

function normalizeTextForHash(content) {
    return String(content || '').replace(/\r\n?/g, '\n');
}

function createContentVersion(content, length = 16) {
    if (!Number.isInteger(length) || length < 8 || length > 64) {
        throw new Error('Content version length must be an integer between 8 and 64.');
    }

    return crypto
        .createHash('sha256')
        .update(normalizeTextForHash(content), 'utf8')
        .digest('hex')
        .slice(0, length);
}

function createBinaryVersion(content, length = 16) {
    if (!Number.isInteger(length) || length < 8 || length > 64) {
        throw new Error('Binary version length must be an integer between 8 and 64.');
    }

    return crypto
        .createHash('sha256')
        .update(content)
        .digest('hex')
        .slice(0, length);
}

function createStaticAssetVersion(filePath, content, length = 16) {
    const extension = path.extname(filePath).toLowerCase();
    if (!TEXT_STATIC_ASSET_EXTENSIONS.has(extension)) {
        return createBinaryVersion(content, length);
    }

    // Keep compatibility with cache seeds historically generated on Windows,
    // while producing the same bytes from LF or CRLF checkouts.
    const canonicalWindowsText = normalizeTextForHash(
        Buffer.isBuffer(content) ? content.toString('utf8') : content
    ).replace(/\n/g, '\r\n');

    return createBinaryVersion(Buffer.from(canonicalWindowsText, 'utf8'), length);
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateAssetReference(htmlContent, asset, version) {
    const attribute = asset?.attribute;
    const publicPath = asset?.publicPath;

    if (!['src', 'href'].includes(attribute) || typeof publicPath !== 'string' || !publicPath.startsWith('/')) {
        throw new Error('Invalid frontend asset definition.');
    }

    const pattern = new RegExp(
        `((?:\\s|<)${attribute}=["'])${escapeRegExp(publicPath)}(?:\\?[^"']*)?(["'])`,
        'g'
    );
    let matchCount = 0;
    const updatedHtml = htmlContent.replace(pattern, (match, prefix, suffix) => {
        matchCount++;
        return `${prefix}${publicPath}?v=${version}${suffix}`;
    });

    if (matchCount !== 1) {
        throw new Error(`Expected exactly one ${publicPath} reference in the frontend HTML, found ${matchCount}.`);
    }

    return updatedHtml;
}


function createPrecacheUrls(versionedAssets, additionalUrls = DEFAULT_PRECACHE_STATIC_URLS) {
    const urls = [];
    const indexByPathname = new Map();

    function addUrl(url, { preferVersioned = false } = {}) {
        if (typeof url !== 'string' || !url.startsWith('/')) return;

        const pathname = new URL(url, 'http://localhost').pathname;
        const existingIndex = indexByPathname.get(pathname);
        if (existingIndex === undefined) {
            indexByPathname.set(pathname, urls.length);
            urls.push(url);
            return;
        }

        if (preferVersioned) urls[existingIndex] = url;
    }

    for (const url of additionalUrls) addUrl(url);

    for (const asset of versionedAssets) {
        const publicPath = asset?.publicPath;
        const version = asset?.version;
        if (typeof publicPath !== 'string' || typeof version !== 'string') continue;
        addUrl(`${publicPath}?v=${version}`, { preferVersioned: true });
    }

    return urls;
}

function updateServiceWorkerPrecache(serviceWorkerContent, precacheUrls, cacheSeed = null) {
    const startIndex = serviceWorkerContent.indexOf(SERVICE_WORKER_PRECACHE_START);
    const endIndex = serviceWorkerContent.indexOf(SERVICE_WORKER_PRECACHE_END);
    if (startIndex < 0 || endIndex <= startIndex) {
        throw new Error('Service worker precache markers are missing or invalid.');
    }

    const normalizedUrls = [...new Set(precacheUrls)].sort();
    const cacheVersion = createContentVersion(cacheSeed || JSON.stringify(normalizedUrls), 20);
    const generatedBlock = [
        SERVICE_WORKER_PRECACHE_START,
        `const STATIC_CACHE_NAME = 'f1-guesser-static-${cacheVersion}';`,
        'const PRECACHE_URLS = Object.freeze([',
        ...normalizedUrls.map(url => `    ${JSON.stringify(url)},`),
        ']);',
        SERVICE_WORKER_PRECACHE_END
    ].join('\n');

    return `${serviceWorkerContent.slice(0, startIndex)}${generatedBlock}${serviceWorkerContent.slice(
        endIndex + SERVICE_WORKER_PRECACHE_END.length
    )}`;
}

function versionServiceWorker(rootDir, versionedAssets, options = {}) {
    const serviceWorkerFile = options.serviceWorkerFile || DEFAULT_SERVICE_WORKER_FILE;
    const serviceWorkerPath = path.join(rootDir, serviceWorkerFile);
    if (!fs.existsSync(serviceWorkerPath)) {
        throw new Error(`Service worker file not found: ${serviceWorkerFile}`);
    }

    const precacheStaticUrls = options.precacheStaticUrls || DEFAULT_PRECACHE_STATIC_URLS;
    const staticAssetVersions = [];
    for (const staticUrl of precacheStaticUrls) {
        const pathname = new URL(staticUrl, 'http://localhost').pathname;
        let staticFile = path.join(rootDir, 'public', pathname.replace(/^\/+/, ''));
        if (fs.existsSync(staticFile) && fs.statSync(staticFile).isDirectory()) {
            staticFile = path.join(staticFile, 'index.html');
        }
        if (!fs.existsSync(staticFile) || !fs.statSync(staticFile).isFile()) {
            throw new Error(`Precache static asset not found: ${staticUrl}`);
        }
        staticAssetVersions.push(`${staticUrl}:${createStaticAssetVersion(staticFile, fs.readFileSync(staticFile))}`);
    }

    const originalContent = fs.readFileSync(serviceWorkerPath, 'utf8');
    const precacheUrls = createPrecacheUrls(versionedAssets, precacheStaticUrls);
    const cacheSeed = JSON.stringify({
        precacheUrls: [...precacheUrls].sort(),
        staticAssetVersions: staticAssetVersions.sort()
    });
    const updatedContent = updateServiceWorkerPrecache(originalContent, precacheUrls, cacheSeed);
    const changed = updatedContent !== originalContent;
    if (changed) fs.writeFileSync(serviceWorkerPath, updatedContent, 'utf8');

    return {
        serviceWorkerFile,
        changed,
        precacheUrls
    };
}

function versionFrontendAssets(rootDir = process.cwd(), options = {}) {
    const indexFile = options.indexFile || DEFAULT_INDEX_FILE;
    const assets = options.assets || DEFAULT_ASSETS;
    const indexPath = path.join(rootDir, indexFile);

    if (!fs.existsSync(indexPath)) {
        throw new Error(`Frontend HTML file not found: ${indexFile}`);
    }

    const originalHtml = fs.readFileSync(indexPath, 'utf8');
    let updatedHtml = originalHtml;
    const versionedAssets = [];

    for (const asset of assets) {
        const sourcePath = path.join(rootDir, asset.sourceFile || '');
        if (!asset.sourceFile || !fs.existsSync(sourcePath)) {
            throw new Error(`Frontend asset not found: ${asset.sourceFile || asset.publicPath || 'unknown'}`);
        }

        const version = createContentVersion(fs.readFileSync(sourcePath, 'utf8'));
        updatedHtml = updateAssetReference(updatedHtml, asset, version);
        versionedAssets.push({ ...asset, version });
    }

    const indexChanged = updatedHtml !== originalHtml;
    if (indexChanged) {
        fs.writeFileSync(indexPath, updatedHtml, 'utf8');
    }

    const serviceWorker = versionServiceWorker(rootDir, versionedAssets, options);

    return {
        indexFile,
        changed: indexChanged || serviceWorker.changed,
        indexChanged,
        serviceWorker,
        assets: versionedAssets
    };
}

function runCli() {
    const result = versionFrontendAssets(process.cwd());
    console.log(result.changed
        ? `Versiuni frontend actualizate în ${result.indexFile}.`
        : `Versiunile frontend sunt deja actualizate în ${result.indexFile}.`);
    for (const asset of result.assets) {
        console.log(`${asset.publicPath}?v=${asset.version}`);
    }
    console.log(`${result.serviceWorker.serviceWorkerFile}: ${result.serviceWorker.precacheUrls.length} asset-uri precache.`);
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        console.error(`Eroare versionare frontend: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    TEXT_STATIC_ASSET_EXTENSIONS,
    DEFAULT_ASSETS,
    DEFAULT_INDEX_FILE,
    DEFAULT_PRECACHE_STATIC_URLS,
    DEFAULT_SERVICE_WORKER_FILE,
    SERVICE_WORKER_PRECACHE_END,
    SERVICE_WORKER_PRECACHE_START,
    createBinaryVersion,
    createContentVersion,
    createPrecacheUrls,
    createStaticAssetVersion,
    normalizeTextForHash,
    updateAssetReference,
    updateServiceWorkerPrecache,
    versionFrontendAssets,
    versionServiceWorker
};
