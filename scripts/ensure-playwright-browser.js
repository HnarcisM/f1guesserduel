const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const strictMode = args.has('--strict') || process.env.F1_STRICT_PLAYWRIGHT_INSTALL === '1';

function log(message) {
    console.log(`[playwright] ${message}`);
}

function warn(message) {
    console.warn(`[playwright] ${message}`);
}

function runCommand(command, args) {
    execFileSync(command, args, {
        stdio: 'inherit',
        shell: false
    });
}

function getLocalPlaywrightCliPath() {
    try {
        const packageJsonPath = require.resolve('playwright/package.json');
        const packageRoot = path.dirname(packageJsonPath);
        const cliPath = path.join(packageRoot, 'cli.js');
        return fs.existsSync(cliPath) ? cliPath : null;
    } catch (error) {
        return null;
    }
}

function installChromium() {
    const localCliPath = getLocalPlaywrightCliPath();

    if (localCliPath) {
        runCommand(process.execPath, [localCliPath, 'install', 'chromium']);
        return;
    }

    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    runCommand(npxCommand, ['playwright', 'install', 'chromium']);
}

function failOrWarn(error) {
    warn('Nu am putut verifica/instala automat Chromium pentru Playwright.');
    warn(error && error.message ? error.message : String(error));
    warn('Setup recomandat: npm install && npm run test:e2e:install');
    warn('Instalare manuală alternativă: npx playwright install chromium');

    if (strictMode) {
        process.exit(1);
    }
}

try {
    const { chromium } = require('playwright');
    const chromiumPath = chromium.executablePath();

    if (chromiumPath && fs.existsSync(chromiumPath)) {
        log('Chromium pentru testele E2E este deja instalat.');
        process.exit(0);
    }

    log('Chromium pentru testele E2E lipsește. Îl instalez automat...');
    log('Vei vedea progresul descărcării direct în consola Playwright.');
    installChromium();
    log('Chromium pentru testele E2E a fost instalat.');
} catch (error) {
    failOrWarn(error);
}
