const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_INDEX_FILE = path.join('public', 'index.html');
const DEFAULT_ASSETS = Object.freeze([
    {
        attribute: 'src',
        publicPath: '/js/themeBootstrap.js',
        sourceFile: path.join('public', 'js', 'themeBootstrap.js')
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
        attribute: 'src',
        publicPath: '/js/socketBridgeBootstrap.js',
        sourceFile: path.join('public', 'js', 'socketBridgeBootstrap.js')
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

    const changed = updatedHtml !== originalHtml;
    if (changed) {
        fs.writeFileSync(indexPath, updatedHtml, 'utf8');
    }

    return {
        indexFile,
        changed,
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
    DEFAULT_ASSETS,
    DEFAULT_INDEX_FILE,
    createContentVersion,
    normalizeTextForHash,
    updateAssetReference,
    versionFrontendAssets
};
