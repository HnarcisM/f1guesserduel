const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');

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

async function startAppServer() {
    const port = await getFreePort();
    const dataDir = path.join(os.tmpdir(), `f1guesser-e2e-${process.pid}-${Date.now()}`);
    const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: {
            ...process.env,
            PORT: String(port),
            DATA_DIR: dataDir,
            NODE_ENV: 'test'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });

    child.on('exit', code => {
        if (code !== null && code !== 0) {
            output += `\nServer exited with code ${code}`;
        }
    });

    await waitForUrl(`http://127.0.0.1:${port}/`).catch(error => {
        child.kill('SIGTERM');
        throw new Error(`${error.message}\nServer output:\n${output}`);
    });

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        stop: async () => {
            if (!child.killed) child.kill('SIGTERM');
            await new Promise(resolve => child.once('close', resolve));
        }
    };
}

async function openRoomPage(context, baseUrl, roomId) {
    const page = await context.newPage();
    page.on('pageerror', error => {
        throw error;
    });
    await page.goto(`${baseUrl}/?room=${roomId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#duelStatus');
    return page;
}

async function pickFirstSuggestion(page, query) {
    await page.locator('#driverInput').fill(query);
    const firstSuggestion = page.locator('#suggestions li').first();
    await firstSuggestion.waitFor({ state: 'visible', timeout: 5000 });
    const selectedName = (await firstSuggestion.textContent()).trim();
    await firstSuggestion.click();
    return selectedName;
}

test('2 players can play while a third browser tab watches live as spectator', async () => {
    const { chromium } = requirePlaywright();
    const app = await startAppServer();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });

    try {
        const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
        const roomId = `e2e-${Date.now()}`;

        const playerOne = await openRoomPage(context, app.baseUrl, roomId);
        const playerTwo = await openRoomPage(context, app.baseUrl, roomId);
        const spectator = await openRoomPage(context, app.baseUrl, roomId);

        await spectator.locator('body.spectator-active').waitFor({ timeout: 7000 });
        await expectText(spectator.locator('#duelStatus'), /Spectator/);
        await assertElementHidden(playerOne.locator('#liveDuelBoard'));
        await assertElementHidden(playerTwo.locator('#liveDuelBoard'));

        await playerOne.locator('.btn-diff.easy').click();

        await playerOne.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await playerTwo.locator('#gameZone:not(.game-zone-hidden)').waitFor({ timeout: 7000 });
        await spectator.locator('#liveDuelBoard:not(.is-hidden)').waitFor({ timeout: 7000 });
        await assertElementHidden(spectator.locator('#grid'));

        const firstGuess = await pickFirstSuggestion(playerOne, 'Arvid');
        await spectator.locator('#liveDuelPlayers').getByText(firstGuess, { exact: false }).waitFor({ timeout: 7000 });
        await expectText(spectator.locator('#liveDuelSummary'), /1 încercări/);

        const secondGuess = await pickFirstSuggestion(playerTwo, 'Andrea');
        await spectator.locator('#liveDuelPlayers').getByText(secondGuess, { exact: false }).waitFor({ timeout: 7000 });
        await expectText(spectator.locator('#liveDuelSummary'), /2 încercări/);

        await assertElementHidden(playerOne.locator('#liveDuelBoard'));
        await assertElementHidden(playerTwo.locator('#liveDuelBoard'));
    } finally {
        await browser.close();
        await app.stop();
    }
});

async function expectText(locator, pattern) {
    await assertEventually(async () => {
        const text = await locator.textContent();
        assert.match(text || '', pattern);
    });
}

async function assertElementHidden(locator) {
    await assertEventually(async () => {
        const visible = await locator.isVisible();
        assert.equal(visible, false);
    });
}

async function assertEventually(assertion, timeoutMs = 7000) {
    const startedAt = Date.now();
    let lastError;

    while (Date.now() - startedAt < timeoutMs) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    throw lastError;
}
