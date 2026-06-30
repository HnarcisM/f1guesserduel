const fs = require('fs');
const { execFileSync } = require('child_process');

function log(message) {
    console.log(`[playwright] ${message}`);
}

function warn(message) {
    console.warn(`[playwright] ${message}`);
}

function installChromium() {
    const playwrightCli = require.resolve('playwright/cli');
    execFileSync(process.execPath, [playwrightCli, 'install', 'chromium'], {
        stdio: 'inherit'
    });
}

try {
    const { chromium } = require('playwright');
    const chromiumPath = chromium.executablePath();

    if (chromiumPath && fs.existsSync(chromiumPath)) {
        log('Chromium pentru testele E2E este deja instalat.');
        process.exit(0);
    }

    log('Chromium pentru testele E2E lipsește. Îl instalez automat...');
    installChromium();
    log('Chromium pentru testele E2E a fost instalat.');
} catch (error) {
    warn('Nu am putut verifica/instala automat Chromium pentru Playwright.');
    warn(error && error.message ? error.message : String(error));
    warn('Poți rula manual: npm run e2e:install');

    if (process.env.F1_STRICT_PLAYWRIGHT_INSTALL === '1') {
        process.exit(1);
    }
}
