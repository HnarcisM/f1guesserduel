import { STYLE_URL } from './extendedModesConfig.js';

export function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text);
    return element;
}

export function setVisible(element, visible) {
    element.hidden = !visible;
    element.setAttribute?.('aria-hidden', String(!visible));
}

export function ensureStylesheet(documentObject) {
    const existing = documentObject.querySelector?.('link[data-extended-modes-style]');
    if (existing) return existing;
    const link = documentObject.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_URL;
    link.dataset.extendedModesStyle = 'true';
    documentObject.head?.append?.(link);
    return link;
}

export function createShell(documentObject) {
    const backdrop = createElement(documentObject, 'div', 'extended-mode-backdrop');
    backdrop.id = 'extendedModeBackdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');

    const panel = createElement(documentObject, 'section', 'extended-mode-panel');
    panel.id = 'extendedModePanel';
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'extendedModeTitle');
    panel.setAttribute('aria-describedby', 'extendedModeDescription');

    panel.innerHTML = `
        <header class="extended-mode-header">
            <div>
                <p id="extendedModeEyebrow" class="extended-mode-eyebrow">Mod nou</p>
                <h2 id="extendedModeTitle">F1 Guesser</h2>
                <p id="extendedModeDescription" class="extended-mode-description"></p>
            </div>
            <button type="button" id="extendedModeClose" class="extended-mode-close" aria-label="Închide modul">×</button>
        </header>
        <section id="extendedModeSetup" class="extended-mode-setup" hidden></section>
        <section id="extendedModeGame" class="extended-mode-game" hidden>
            <div class="extended-mode-hud" role="group" aria-label="Starea jocului">
                <div><span>Scor</span><strong id="extendedModeScore">0</strong></div>
                <div><span>Rundă</span><strong id="extendedModeRound">1</strong></div>
                <div><span>Încercări</span><strong id="extendedModeAttempts">0/6</strong></div>
                <div><span id="extendedModeMetricLabel">Timp</span><strong id="extendedModeMetric">—</strong></div>
            </div>
            <div id="extendedModeProgress" class="extended-mode-progress" aria-hidden="true"><span></span></div>
            <section id="extendedModeClue" class="extended-mode-clue" hidden></section>
            <section id="extendedSudoku" class="extended-sudoku" hidden></section>
            <div id="extendedGuessArea" class="extended-guess-area">
                <label for="extendedGuessInput" id="extendedGuessLabel">Alege răspunsul</label>
                <div class="extended-search-row">
                    <div class="extended-search-box">
                        <input id="extendedGuessInput" type="text" autocomplete="off" placeholder="Scrie numele...">
                        <div id="extendedSuggestions" class="extended-suggestions" role="listbox" hidden></div>
                    </div>
                    <button type="button" id="extendedSubmitGuess" class="extended-primary-btn">Trimite</button>
                </div>
            </div>
            <p id="extendedModeStatus" class="extended-mode-status" role="status" aria-live="polite"></p>
            <div id="extendedModeActions" class="extended-mode-actions">
                <button type="button" id="extendedSkipRound" class="extended-secondary-btn" hidden>Sari runda · −250</button>
                <button type="button" id="extendedContinue" class="extended-primary-btn" hidden>Următoarea rundă</button>
            </div>
            <section id="extendedComparison" class="extended-comparison" aria-live="polite"></section>
            <section id="extendedModeResult" class="extended-mode-result" hidden>
                <p class="extended-mode-result-eyebrow">Rezultat final</p>
                <h3 id="extendedResultTitle">Sesiune finalizată</h3>
                <p id="extendedResultMessage"></p>
                <div id="extendedResultStats" class="extended-result-stats"></div>
                <div class="extended-result-actions">
                    <button type="button" id="extendedRestart" class="extended-primary-btn">Joacă din nou</button>
                    <button type="button" id="extendedHome" class="extended-secondary-btn">Înapoi la moduri</button>
                </div>
            </section>
        </section>
    `;

    documentObject.body.append(backdrop, panel);
    return { backdrop, panel };
}

export function collectExtendedModeElements({ backdrop, panel }) {
    return {
        backdrop,
        panel,
        close: panel.querySelector('#extendedModeClose'),
        eyebrow: panel.querySelector('#extendedModeEyebrow'),
        title: panel.querySelector('#extendedModeTitle'),
        description: panel.querySelector('#extendedModeDescription'),
        setup: panel.querySelector('#extendedModeSetup'),
        game: panel.querySelector('#extendedModeGame'),
        score: panel.querySelector('#extendedModeScore'),
        round: panel.querySelector('#extendedModeRound'),
        attempts: panel.querySelector('#extendedModeAttempts'),
        metricLabel: panel.querySelector('#extendedModeMetricLabel'),
        metric: panel.querySelector('#extendedModeMetric'),
        progress: panel.querySelector('#extendedModeProgress'),
        progressBar: panel.querySelector('#extendedModeProgress span'),
        clue: panel.querySelector('#extendedModeClue'),
        sudoku: panel.querySelector('#extendedSudoku'),
        guessArea: panel.querySelector('#extendedGuessArea'),
        guessLabel: panel.querySelector('#extendedGuessLabel'),
        input: panel.querySelector('#extendedGuessInput'),
        suggestions: panel.querySelector('#extendedSuggestions'),
        submit: panel.querySelector('#extendedSubmitGuess'),
        status: panel.querySelector('#extendedModeStatus'),
        skip: panel.querySelector('#extendedSkipRound'),
        continueButton: panel.querySelector('#extendedContinue'),
        comparison: panel.querySelector('#extendedComparison'),
        result: panel.querySelector('#extendedModeResult'),
        resultTitle: panel.querySelector('#extendedResultTitle'),
        resultMessage: panel.querySelector('#extendedResultMessage'),
        resultStats: panel.querySelector('#extendedResultStats'),
        restart: panel.querySelector('#extendedRestart'),
        home: panel.querySelector('#extendedHome')
    };
}
