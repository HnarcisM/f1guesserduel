const { spawn } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

function waitForUrl(url, timeoutMs = 15000) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        function check() {
            fetch(url)
                .then(response => {
                    if (response.ok) {
                        resolve();
                        return;
                    }
                    throw new Error(`Server responded with ${response.status}`);
                })
                .catch(error => {
                    if (Date.now() - startedAt > timeoutMs) {
                        reject(new Error(`Server did not become ready at ${url}: ${error.message}`));
                        return;
                    }
                    setTimeout(check, 250);
                });
        }

        check();
    });
}

function requirePlaywright() {
    try {
        return require('playwright');
    } catch (error) {
        throw new Error(
            'Playwright is required for E2E tests. Run "npm install" and then "npx playwright install chromium" before "npm run test:e2e".'
        );
    }
}

function logE2E(message) {
    const now = new Date().toLocaleTimeString('ro-RO', { hour12: false });
    console.log(`[E2E ${now}] ${message}`);
}

async function startAppServer(options = {}) {
    logE2E('Caut port liber pentru serverul de test...');
    const port = await getFreePort();
    const dataDir = options.dataDir || path.join(os.tmpdir(), `f1guesser-e2e-${process.pid}-${Date.now()}`);
    logE2E(`Pornesc serverul de test pe portul ${port}...`);
    const child = spawn(process.execPath, ['server/index.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: {
            ...process.env,
            PORT: String(port),
            DATA_DIR: dataDir,
            NODE_ENV: 'test',
            ROOM_SAVE_DEBOUNCE_MS: '50',
            E2E_FIXED_DUEL_TARGET_ID: 'LIN'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.on('exit', code => {
        if (code !== null && code !== 0) output += `\nServer exited with code ${code}`;
    });

    logE2E('Aștept ca serverul de test să fie gata...');
    await waitForUrl(`http://127.0.0.1:${port}/`).catch(error => {
        child.kill('SIGTERM');
        throw new Error(`${error.message}\nServer output:\n${output}`);
    });

    logE2E('Serverul de test este gata.');
    let stopPromise = null;
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        dataDir,
        stop: async () => {
            if (child.exitCode !== null) return;
            if (!stopPromise) {
                stopPromise = new Promise(resolve => child.once('close', resolve));
                if (!child.killed) child.kill('SIGTERM');
            }
            await stopPromise;
        }
    };
}

async function stabilizePage(page) {
    const stylesheetUrl = new URL('/__e2e-stabilize.css', page.url()).href;
    await page.route(stylesheetUrl, route => route.fulfill({
        contentType: 'text/css; charset=utf-8',
        body: [
            '*, *::before, *::after {',
            '  transition-duration: 0s !important;',
            '  animation-duration: 0s !important;',
            '  caret-color: transparent !important;',
            '}'
        ].join('\n')
    }));
    await page.addStyleTag({
        url: stylesheetUrl
    });
    await page.evaluate(() => document.fonts && document.fonts.ready);
}

function failOnPageError(page) {
    page.on('pageerror', error => {
        throw error;
    });
}

async function openRoomPage(context, baseUrl, roomId, options = {}) {
    const page = await context.newPage();
    failOnPageError(page);
    await page.goto(`${baseUrl}/?room=${roomId}`, { waitUntil: 'domcontentloaded' });
    await stabilizePage(page);
    const shouldWaitForVisibleDuelStatus = options.waitForVisibleDuelStatus !== false;
    await page.waitForSelector('#duelStatus', {
        state: shouldWaitForVisibleDuelStatus ? 'visible' : 'attached'
    });
    return page;
}

async function openAppPage(context, baseUrl) {
    const page = await context.newPage();
    failOnPageError(page);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await stabilizePage(page);
    await page.locator('[data-game-mode-choice="single"]').waitFor({ state: 'visible', timeout: 7000 });
    await page.locator('body.mode-single').waitFor({ timeout: 7000 });
    return page;
}

module.exports = {
    logE2E,
    openAppPage,
    openRoomPage,
    requirePlaywright,
    stabilizePage,
    startAppServer
};
