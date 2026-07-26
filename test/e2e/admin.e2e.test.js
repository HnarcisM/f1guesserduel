const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
    createE2EContext,
    logE2E,
    requirePlaywright,
    stabilizePage,
    startAppServer
} = require('./e2eTestHarness');

const ADMIN_PASSWORD = 'AdminPass123!';
const NORMAL_PASSWORD = 'NormalPass123!';
const MOBILE_VIEWPORTS = Object.freeze([
    Object.freeze({ label: 'phone-360', width: 360, height: 800 }),
    Object.freeze({ label: 'fold-cover', width: 344, height: 882 })
]);

async function submitAuthRequest(page, baseUrl, action, credentials) {
    if (!page.url().startsWith(baseUrl)) {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    }

    return page.evaluate(async ({ actionName, input }) => {
        const response = await fetch(`/api/auth/${actionName}`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        });
        return {
            status: response.status,
            payload: await response.json().catch(() => ({}))
        };
    }, { actionName: action, input: credentials });
}

async function registerAccount(page, baseUrl, credentials) {
    const result = await submitAuthRequest(page, baseUrl, 'register', credentials);
    assert.equal(result.status, 201, result.payload?.message || 'Înregistrarea E2E a eșuat.');
    assert.equal(result.payload?.user?.username, credentials.username);
    return result.payload.user;
}

async function openAdminPage(page, baseUrl, expectedUsername) {
    const response = await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    await stabilizePage(page);
    await page.locator('#adminIdentity').filter({ hasText: expectedUsername }).waitFor({
        state: 'visible',
        timeout: 7000
    });
    await page.locator('#adminMetricGrid .admin-metric').first().waitFor({
        state: 'visible',
        timeout: 7000
    });
}

async function selectAdminView(page, view) {
    await page.locator(`[data-admin-view="${view}"]`).click();
    const viewId = `#adminView${view[0].toUpperCase()}${view.slice(1)}`;
    await page.locator(`${viewId}:not(.is-hidden)`).waitFor({ state: 'visible', timeout: 7000 });
}

async function collectMobileMetrics(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const element = document.querySelector(selector);
            const bounds = element?.getBoundingClientRect();
            return bounds ? {
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                bottom: bounds.bottom,
                width: bounds.width,
                height: bounds.height,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth
            } : null;
        };
        const refresh = document.querySelector('#adminRefreshBtn');
        const refreshRect = refresh?.getBoundingClientRect();
        const refreshStyle = refresh ? getComputedStyle(refresh) : null;

        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
            shell: rect('.admin-shell'),
            sidebar: rect('.admin-sidebar'),
            navigation: rect('.admin-nav'),
            main: rect('.admin-main'),
            activeView: rect('.admin-view:not(.is-hidden)'),
            tableWrap: rect('.admin-view:not(.is-hidden) .admin-table-wrap'),
            dialog: rect('#adminUserDialog[open]'),
            dialogHeader: rect('#adminUserDialog[open] .admin-user-dialog-head'),
            dialogDetails: rect('#adminUserDialog[open] .admin-user-details'),
            dialogClose: rect('#adminUserDialogClose'),
            refreshVisible: Boolean(refreshRect && refreshStyle
                && refreshStyle.display !== 'none'
                && refreshStyle.visibility !== 'hidden'
                && Number.parseFloat(refreshStyle.opacity || '1') > 0
                && refreshRect.width > 0
                && refreshRect.height > 0),
            refreshRight: refreshRect?.right ?? null
        };
    });
}

function assertMobileLayout(metrics, label) {
    const tolerance = 1;
    assert.ok(
        metrics.documentWidth <= metrics.viewport.width + tolerance,
        `${label}: pagina admin are overflow orizontal (${metrics.documentWidth}px > ${metrics.viewport.width}px)`
    );
    for (const [name, bounds] of Object.entries({
        shell: metrics.shell,
        sidebar: metrics.sidebar,
        navigation: metrics.navigation,
        main: metrics.main,
        activeView: metrics.activeView
    })) {
        assert.ok(bounds, `${label}: lipsește zona ${name}`);
        assert.ok(bounds.left >= -tolerance, `${label}: ${name} depășește marginea stângă`);
        assert.ok(
            bounds.right <= metrics.viewport.width + tolerance,
            `${label}: ${name} depășește marginea dreaptă`
        );
    }
    assert.equal(metrics.refreshVisible, true, `${label}: butonul Actualizează nu este vizibil`);
    assert.ok(
        metrics.refreshRight <= metrics.viewport.width + tolerance,
        `${label}: butonul Actualizează iese din viewport`
    );
}


function assertMobileDialog(metrics, label) {
    const tolerance = 1;
    assert.ok(metrics.dialog, `${label}: dialogul de detalii nu este deschis`);
    assert.ok(metrics.dialog.left >= -tolerance, `${label}: dialogul depășește marginea stângă`);
    assert.ok(
        metrics.dialog.right <= metrics.viewport.width + tolerance,
        `${label}: dialogul depășește marginea dreaptă`
    );
    assert.ok(metrics.dialog.top >= -tolerance, `${label}: dialogul depășește marginea de sus`);
    assert.ok(
        metrics.dialog.bottom <= metrics.viewport.height + tolerance,
        `${label}: dialogul depășește marginea de jos`
    );
    assert.ok(
        metrics.dialog.scrollWidth <= metrics.dialog.clientWidth + tolerance,
        `${label}: dialogul are overflow intern (${metrics.dialog.scrollWidth}px > ${metrics.dialog.clientWidth}px)`
    );
    for (const [name, bounds] of Object.entries({
        dialogHeader: metrics.dialogHeader,
        dialogDetails: metrics.dialogDetails,
        dialogClose: metrics.dialogClose
    })) {
        assert.ok(bounds, `${label}: lipsește zona ${name}`);
        assert.ok(
            bounds.left >= metrics.dialog.left - tolerance,
            `${label}: ${name} depășește marginea stângă a dialogului`
        );
        assert.ok(
            bounds.right <= metrics.dialog.right + tolerance,
            `${label}: ${name} depășește marginea dreaptă a dialogului (${bounds.right}px > ${metrics.dialog.right}px)`
        );
    }
    assert.ok(
        metrics.dialogClose.right <= metrics.viewport.width + tolerance,
        `${label}: butonul de închidere al dialogului iese din viewport (${metrics.dialogClose.right}px > ${metrics.viewport.width}px)`
    );
}

test('admin console protects access and supports core moderation flows', { concurrency: false }, async t => {
    logE2E('Verific accesul, utilizatorii, moderarea, auditul și layout-ul mobil al panoului admin...');
    const { chromium } = requirePlaywright();
    const app = await startAppServer({ env: { ADMIN_USER_IDS: '1' } });
    let browser;
    let adminContext;
    let normalContext;

    const suffix = Date.now().toString(36).slice(-8);
    const adminCredentials = {
        username: `Admin_${suffix}`,
        email: `admin-${suffix}@example.test`,
        password: ADMIN_PASSWORD
    };
    const normalCredentials = {
        username: `Driver_${suffix}`,
        email: `driver-${suffix}@example.test`,
        password: NORMAL_PASSWORD
    };

    try {
        browser = await chromium.launch({
            headless: process.env.E2E_HEADED !== '1',
            executablePath: process.env.E2E_CHROMIUM_EXECUTABLE_PATH || undefined
        });
        adminContext = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        normalContext = await createE2EContext(browser, { viewport: { width: 1366, height: 900 } });
        const adminPage = await adminContext.newPage();
        const normalPage = await normalContext.newPage();
        adminPage.on('pageerror', error => { throw error; });
        normalPage.on('pageerror', error => { throw error; });

        const adminUser = await registerAccount(adminPage, app.baseUrl, adminCredentials);
        const normalUser = await registerAccount(normalPage, app.baseUrl, normalCredentials);
        assert.equal(adminUser.id, 1, 'Primul cont E2E trebuie să primească ID-ul legacy de administrator.');
        assert.equal(normalUser.id, 2);

        await t.test('utilizatorul normal primește 404 pentru /admin', async () => {
            const response = await normalPage.goto(`${app.baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
            assert.equal(response?.status(), 404);
            assert.match(await normalPage.locator('body').innerText(), /Not found/i);
        });

        await t.test('administratorul poate deschide panoul', async () => {
            await openAdminPage(adminPage, app.baseUrl, adminCredentials.username);
            assert.equal(await adminPage.locator('#adminPageTitle').textContent(), 'Dashboard');
            assert.ok(await adminPage.locator('#adminMetricGrid .admin-metric').count() >= 9);
        });

        await t.test('administratorul poate căuta utilizatori', async () => {
            await selectAdminView(adminPage, 'users');
            await adminPage.locator('#adminUsersMeta').filter({ hasText: 'utilizatori' }).waitFor({
                state: 'visible',
                timeout: 7000
            });
            await adminPage.locator('#adminUserSearch').fill(normalCredentials.username);
            await adminPage.locator('#adminUserSearchForm').evaluate(form => form.requestSubmit());
            const row = adminPage.locator('#adminUsersBody tr').filter({ hasText: normalCredentials.username });
            await row.waitFor({ state: 'visible', timeout: 7000 });
            assert.match(await row.innerText(), new RegExp(normalCredentials.email));
            assert.match(await adminPage.locator('#adminUsersMeta').innerText(), /1 utilizatori găsiți/i);
        });

        await t.test('administratorul poate deschide detaliile unui cont', async () => {
            const row = adminPage.locator('#adminUsersBody tr').filter({ hasText: normalCredentials.username });
            await row.getByRole('button', { name: 'Detalii' }).click();
            await adminPage.locator('#adminUserDialog[open]').waitFor({ state: 'visible', timeout: 7000 });
            assert.match(await adminPage.locator('#adminUserDialogTitle').innerText(), new RegExp(normalCredentials.username));
            assert.match(await adminPage.locator('#adminUserDetails').innerText(), new RegExp(normalCredentials.email));
            assert.match(await adminPage.locator('#adminUserDetails').innerText(), /Status\s+Activ/i);
        });

        await t.test('suspendarea cu parolă greșită este refuzată', async () => {
            await adminPage.locator('#adminUserActions').getByRole('button', { name: 'Suspendă' }).click();
            await adminPage.locator('#adminSuspendDialog[open]').waitFor({ state: 'visible', timeout: 7000 });
            await adminPage.locator('#adminSuspendReason').fill('Test E2E pentru reconfirmarea parolei');
            await adminPage.locator('#adminSuspendPassword').fill('ParolaGresita123!');
            await adminPage.locator('#adminSuspendForm').evaluate(form => form.requestSubmit());
            await adminPage.locator('#adminSuspendError').filter({
                hasText: 'Parola administratorului este greșită.'
            }).waitFor({ state: 'visible', timeout: 7000 });
            assert.equal(await adminPage.locator('#adminSuspendDialog').getAttribute('open'), '');
            await adminPage.locator('#adminSuspendCancel').click();
            await adminPage.locator('#adminSuspendDialog').waitFor({ state: 'hidden', timeout: 7000 });
            await adminPage.locator('#adminUserDialogClose').click();
        });

        await t.test('auditul poate fi filtrat după categorie și text', async () => {
            await selectAdminView(adminPage, 'audit');
            await adminPage.locator('#adminAuditMeta').filter({ hasText: 'înregistrări' }).waitFor({
                state: 'visible',
                timeout: 7000
            });
            await adminPage.locator('#adminAuditAction').selectOption('admin.');
            await adminPage.locator('#adminAuditSearch').fill('reauthentication');
            await adminPage.locator('#adminAuditFilterForm').evaluate(form => form.requestSubmit());
            const row = adminPage.locator('#adminAuditBody tr').filter({
                hasText: 'admin.reauthentication.failed'
            });
            await row.waitFor({ state: 'visible', timeout: 7000 });
            const actions = await adminPage.locator('#adminAuditBody tr td:nth-child(3) strong').allTextContents();
            assert.ok(actions.length >= 1);
            assert.equal(actions.every(action => action.startsWith('admin.')), true);
            assert.match(await adminPage.locator('#adminAuditMeta').innerText(), /1 înregistrări/i);
        });

        await t.test('administratorul poate inspecta controalele operaționale și statisticile', async () => {
            await selectAdminView(adminPage, 'operations');
            await adminPage.locator('#adminModeToggles [data-mode-key]').first().waitFor({
                state: 'visible',
                timeout: 7000
            });
            assert.equal(await adminPage.locator('#adminModeToggles [data-mode-key]').count(), 10);
            assert.equal(await adminPage.locator('#adminServiceStatus .admin-service-card').count(), 2);
            assert.match(await adminPage.locator('#adminOperationsMeta').innerText(), /notificare login admin/i);

            await selectAdminView(adminPage, 'analytics');
            await adminPage.locator('#adminAnalyticsMeta').filter({ hasText: 'jocuri analizate' }).waitFor({
                state: 'visible',
                timeout: 7000
            });
        });

        await t.test('panoul rămâne utilizabil pe ecrane mobile', async () => {
            await selectAdminView(adminPage, 'dashboard');
            for (const viewport of MOBILE_VIEWPORTS) {
                await adminPage.setViewportSize({ width: viewport.width, height: viewport.height });
                await adminPage.reload({ waitUntil: 'domcontentloaded' });
                await adminPage.locator('#adminMetricGrid .admin-metric').first().waitFor({
                    state: 'visible',
                    timeout: 7000
                });
                let metrics = await collectMobileMetrics(adminPage);
                assert.deepEqual(metrics.viewport, { width: viewport.width, height: viewport.height });
                assertMobileLayout(metrics, `${viewport.label}/dashboard`);
                await adminPage.locator('#adminRefreshBtn').click({ trial: true });

                await selectAdminView(adminPage, 'users');
                await adminPage.locator('#adminUsersMeta').filter({ hasText: 'utilizatori' }).waitFor({
                    state: 'visible',
                    timeout: 7000
                });
                const mobileUserRow = adminPage.locator('#adminUsersBody tr').filter({
                    hasText: normalCredentials.username
                });
                await mobileUserRow.waitFor({ state: 'visible', timeout: 7000 });
                metrics = await collectMobileMetrics(adminPage);
                assertMobileLayout(metrics, `${viewport.label}/users`);
                assert.ok(metrics.tableWrap, `${viewport.label}: tabelul utilizatorilor nu are container responsive`);

                await mobileUserRow.getByRole('button', { name: 'Detalii' }).click();
                await adminPage.locator('#adminUserDialog[open]').waitFor({ state: 'visible', timeout: 7000 });
                metrics = await collectMobileMetrics(adminPage);
                assertMobileDialog(metrics, `${viewport.label}/user-dialog`);
                await adminPage.locator('#adminUserDialogClose').click({ trial: true });
                await adminPage.locator('#adminUserDialogClose').click();
                await adminPage.locator('#adminUserDialog').waitFor({ state: 'hidden', timeout: 7000 });

                await selectAdminView(adminPage, 'operations');
                await adminPage.locator('#adminModeToggles [data-mode-key]').first().waitFor({ state: 'visible', timeout: 7000 });
                metrics = await collectMobileMetrics(adminPage);
                assertMobileLayout(metrics, `${viewport.label}/operations`);

                await selectAdminView(adminPage, 'analytics');
                await adminPage.locator('#adminAnalyticsMeta').filter({ hasText: 'jocuri analizate' }).waitFor({ state: 'visible', timeout: 7000 });
                metrics = await collectMobileMetrics(adminPage);
                assertMobileLayout(metrics, `${viewport.label}/analytics`);
                assert.ok(metrics.tableWrap, `${viewport.label}: tabelul statisticilor nu are container responsive`);
            }
        });
    } finally {
        await Promise.allSettled([
            adminContext?.close?.(),
            normalContext?.close?.()
        ]);
        if (browser) await browser.close();
        await app.stop();
        fs.rmSync(app.dataDir, { recursive: true, force: true });
    }
});
