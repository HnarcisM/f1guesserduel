const DEFAULT_READY_TIMEOUT_MS = 7000;

async function confirmDuelReady(page, timeoutMs = DEFAULT_READY_TIMEOUT_MS) {
    const readyButton = page.locator('#duelLobbyReadyBtn:not([hidden]):not(:disabled)');
    await readyButton.waitFor({ state: 'visible', timeout: timeoutMs });
    await readyButton.click();
    await page.locator('#duelLobbyReadyBtn[aria-pressed="true"]')
        .waitFor({ state: 'visible', timeout: timeoutMs });
}

async function startReadyDuelRound(hostPage, playerTwoPage, level = 'easy', timeoutMs = DEFAULT_READY_TIMEOUT_MS) {
    if (!hostPage || !playerTwoPage) {
        throw new Error('Starting a Duel round requires both active player pages.');
    }

    await Promise.all([
        hostPage.locator('#duelLobbyPanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: timeoutMs }),
        playerTwoPage.locator('#duelLobbyPanel:not(.is-hidden)').waitFor({ state: 'visible', timeout: timeoutMs })
    ]);

    const levelButton = hostPage.locator(`[data-duel-lobby-level="${level}"]`);
    await levelButton.waitFor({ state: 'visible', timeout: timeoutMs });
    await levelButton.click();

    await confirmDuelReady(hostPage, timeoutMs);
    await confirmDuelReady(playerTwoPage, timeoutMs);

    const startButton = hostPage.locator('#duelLobbyStartBtn:not(:disabled)');
    await startButton.waitFor({ state: 'visible', timeout: timeoutMs });
    await startButton.click();
}

module.exports = {
    confirmDuelReady,
    startReadyDuelRound
};
