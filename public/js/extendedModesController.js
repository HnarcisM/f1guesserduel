import { createExtendedComparisonBoard } from './extendedComparisonBoard.js';
import { createExtendedModeAutocomplete } from './extendedModeAutocomplete.js';
import { setProgressPercent } from './progressStyle.js';
import {
    formatWeeklyCountdown,
    renderWeeklySetupView,
    updateWeeklyResetInfo
} from './weeklyChallengeView.js';

import { ERA_OPTIONS, RECORDS_KEY, STYLE_URL, VARIANT_COPY } from './extendedModesConfig.js';

function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text);
    return element;
}

function ensureStylesheet(documentObject) {
    const existing = documentObject.querySelector?.('link[data-extended-modes-style]');
    if (existing) return existing;
    const link = documentObject.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_URL;
    link.dataset.extendedModesStyle = 'true';
    documentObject.head?.append?.(link);
    return link;
}

function readRecords(storage) {
    try {
        const parsed = JSON.parse(storage?.getItem?.(RECORDS_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeRecords(storage, records) {
    try {
        storage?.setItem?.(RECORDS_KEY, JSON.stringify(records));
    } catch {
        // Local records are optional; private browsing/storage errors must not block gameplay.
    }
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

function normalizeName(value) {
    return String(value || '').trim().toLocaleLowerCase('ro-RO');
}

function createShell(documentObject) {
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

function installSocketListeners(socket, controller) {
    const handlers = {
        extendedModeStarted: payload => controller.handleStarted(payload),
        extendedGuessResult: payload => controller.handleGuessResult(payload),
        extendedRoundResult: payload => controller.handleRoundResult(payload),
        extendedRoundReady: payload => controller.handleRoundReady(payload),
        extendedSudokuUpdate: payload => controller.handleSudokuUpdate(payload),
        extendedModeFinished: payload => controller.handleFinished(payload),
        extendedModeError: message => controller.handleError(message),
        weeklyChallengeStatus: payload => controller.handleWeeklyStatus(payload),
        extendedModeLeft: () => {}
    };
    for (const [eventName, handler] of Object.entries(handlers)) {
        socket.off?.(eventName, handler);
        socket.on?.(eventName, handler);
    }
    return handlers;
}

function createExtendedModesController({ windowObject, documentObject, storage } = {}) {
    const win = windowObject || globalThis.window;
    const doc = documentObject || win?.document;
    if (!doc) return null;

    ensureStylesheet(doc);
    const { backdrop, panel } = createShell(doc);
    const elements = {
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

    const comparisonBoard = createExtendedComparisonBoard({
        documentObject: doc,
        root: elements.comparison
    });

    const state = {
        socket: null,
        socketHandlers: null,
        variantKey: null,
        catalog: [],
        serverState: null,
        activeSudokuCell: null,
        timerInterval: null,
        timeoutSent: false,
        weeklyCountdownInterval: null,
        weeklyResetInfo: null,
        weeklyStatus: null,
        weeklyStartPending: false,
        hasStarted: false,
        trigger: null,
        isOpen: false,
        records: readRecords(storage || win?.localStorage)
    };

    function setStatus(message, kind = '') {
        elements.status.textContent = String(message || '');
        elements.status.dataset.kind = kind;
    }

    function setVisible(element, visible) {
        element.hidden = !visible;
        element.setAttribute?.('aria-hidden', String(!visible));
    }

    const autocomplete = createExtendedModeAutocomplete({
        documentObject: doc,
        input: elements.input,
        suggestions: elements.suggestions,
        getCatalog: () => state.catalog,
        getVariantKey: () => state.variantKey,
        onSubmit: submitGuess
    });

    function resetInput() {
        elements.input.value = '';
        autocomplete.resetSelection();
    }

    function getSocket() {
        return win?.__f1GameSocket || state.socket || null;
    }

    function waitForSocket(timeoutMs = 3500) {
        const existing = getSocket();
        if (existing) return Promise.resolve(existing);
        return new Promise(resolve => {
            let finished = false;
            const timeout = win.setTimeout(() => {
                if (finished) return;
                finished = true;
                win.removeEventListener?.('f1:socket-created', handleCreated);
                resolve(win.__f1GameSocket || null);
            }, timeoutMs);
            function handleCreated(event) {
                if (finished) return;
                finished = true;
                win.clearTimeout(timeout);
                win.removeEventListener?.('f1:socket-created', handleCreated);
                resolve(event?.detail?.socket || win.__f1GameSocket || null);
            }
            win.addEventListener?.('f1:socket-created', handleCreated, { once: true });
        });
    }

    function bindSocket(socket) {
        if (!socket || state.socket === socket) return;
        if (state.socket && state.socketHandlers) {
            for (const [eventName, handler] of Object.entries(state.socketHandlers)) {
                state.socket.off?.(eventName, handler);
            }
        }
        state.socket = socket;
        state.socketHandlers = installSocketListeners(socket, controller);
    }

    function emit(eventName, payload) {
        const socket = getSocket();
        if (!socket) {
            setStatus('Conexiunea la server nu este disponibilă.', 'error');
            return false;
        }
        socket.emit(eventName, payload);
        return true;
    }

    function updateHeader() {
        const copy = VARIANT_COPY[state.variantKey] || VARIANT_COPY['speed-run'];
        elements.eyebrow.textContent = copy.eyebrow;
        elements.title.textContent = copy.title;
        elements.description.textContent = copy.description;
    }

    function clearTimer() {
        if (state.timerInterval) win.clearInterval(state.timerInterval);
        state.timerInterval = null;
        state.timeoutSent = false;
    }

    function clearWeeklyCountdown() {
        if (state.weeklyCountdownInterval) win.clearInterval(state.weeklyCountdownInterval);
        state.weeklyCountdownInterval = null;
        state.weeklyResetInfo = null;
    }

    function getWeeklyCountdownText() {
        return formatWeeklyCountdown(state.weeklyStatus);
    }

    function updateWeeklyCountdown() {
        updateWeeklyResetInfo(state.weeklyResetInfo, state.weeklyStatus);
    }

    function startWeeklyCountdown(infoElement) {
        clearWeeklyCountdown();
        state.weeklyResetInfo = infoElement;
        updateWeeklyCountdown();
        state.weeklyCountdownInterval = win.setInterval(updateWeeklyCountdown, 1000);
    }

    function updateTimer() {
        const rawExpiresAt = state.serverState?.expiresAt;
        if (rawExpiresAt === null || rawExpiresAt === undefined) return;
        const expiresAt = Number(rawExpiresAt);
        if (!Number.isFinite(expiresAt)) return;
        const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        elements.metric.textContent = `${remaining}s`;
        elements.metric.dataset.urgent = String(remaining <= 10);
        if (remaining === 0 && !state.timeoutSent) {
            state.timeoutSent = true;
            emit('extendedModeTimeout');
        }
    }

    function syncTimer() {
        clearTimer();
        const rawExpiresAt = state.serverState?.expiresAt;
        if (rawExpiresAt === null || rawExpiresAt === undefined) return;
        const expiresAt = Number(rawExpiresAt);
        if (!Number.isFinite(expiresAt)) return;
        updateTimer();
        state.timerInterval = win.setInterval(updateTimer, 250);
    }

    function renderHud() {
        const current = state.serverState || {};
        const round = current.round || {};
        elements.score.textContent = Number(current.score || round.score || 0).toLocaleString('ro-RO');
        elements.round.textContent = round.totalRounds
            ? `${round.roundNumber}/${round.totalRounds}`
            : String(round.roundNumber || 1);
        elements.attempts.textContent = round.maxAttempts
            ? `${round.attempts || 0}/${round.maxAttempts}`
            : '—';

        if (state.variantKey === 'streak') {
            elements.metricLabel.textContent = 'Streak';
            elements.metric.textContent = String(round.streak || current.bestMetric || 0);
            elements.metric.dataset.urgent = 'false';
        } else if (current.expiresAt !== null
            && current.expiresAt !== undefined
            && Number.isFinite(Number(current.expiresAt))) {
            elements.metricLabel.textContent = 'Timp';
            syncTimer();
        } else if (state.variantKey === 'pilot-sudoku') {
            elements.metricLabel.textContent = 'Greșeli';
            elements.metric.textContent = String(current.sudoku?.mistakes || 0);
            elements.metric.dataset.urgent = 'false';
        } else {
            elements.metricLabel.textContent = 'Record';
            elements.metric.textContent = String(state.records[state.variantKey]?.bestScore || '—');
            elements.metric.dataset.urgent = 'false';
        }

        const total = Number(round.totalRounds);
        const number = Number(round.roundNumber);
        const progress = Number.isFinite(total) && total > 0
            ? Math.min(100, Math.max(0, ((number - 1) / total) * 100))
            : state.variantKey === 'pilot-sudoku'
                ? ((current.sudoku?.activeCount || 0) / 9) * 100
                : 0;
        setProgressPercent(elements.progressBar, progress);
    }

    function renderTrackClue(clue) {
        elements.clue.replaceChildren();
        if (!clue || clue.type !== 'track-layout' || !Array.isArray(clue.layout)) {
            setVisible(elements.clue, false);
            return;
        }
        const heading = createElement(doc, 'p', 'extended-track-label', 'Silueta circuitului');
        const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Silueta circuitului necunoscut');
        const polyline = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', clue.layout.map(point => point.join(',')).join(' '));
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.append(polyline);
        elements.clue.append(heading, svg);
        setVisible(elements.clue, true);
    }

    function createComparisonRow(feedback) {
        const row = createElement(doc, 'article', 'extended-comparison-row');
        for (const cell of feedback?.cells || []) {
            const item = createElement(doc, 'div', `extended-comparison-cell state-${cell.state || 'red'}`);
            item.append(
                createElement(doc, 'span', 'extended-comparison-label', cell.label),
                createElement(doc, 'strong', '', cell.value)
            );
            row.append(item);
        }
        return row;
    }

    function appendFeedback(feedback) {
        if (!feedback) return;
        if (comparisonBoard?.appendFeedback(feedback)) return;
        elements.comparison.prepend(createComparisonRow(feedback));
    }

    function resolveSelectedEntity() {
        const selectedId = autocomplete.getSelectedEntityId();
        if (selectedId) return state.catalog.find(entry => entry.id === selectedId) || null;
        const normalized = normalizeName(elements.input.value);
        return state.catalog.find(entry => normalizeName(entry.name) === normalized) || null;
    }

    function submitGuess() {
        const entity = resolveSelectedEntity();
        if (!entity) {
            setStatus('Selectează un răspuns valid din listă.', 'error');
            return;
        }
        if (state.variantKey === 'pilot-sudoku') {
            if (!Number.isInteger(state.activeSudokuCell)) {
                setStatus('Selectează mai întâi o celulă din grilă.', 'error');
                return;
            }
            emit('submitExtendedSudokuGuess', {
                cellIndex: state.activeSudokuCell,
                driverId: entity.id
            });
        } else {
            emit('submitExtendedGuess', { id: entity.id });
        }
        elements.submit.disabled = true;
        resetInput();
    }

    function renderSudoku(sudokuState) {
        elements.sudoku.replaceChildren();
        if (!sudokuState) {
            setVisible(elements.sudoku, false);
            return;
        }
        const table = createElement(doc, 'div', 'extended-sudoku-grid');
        table.setAttribute('role', 'grid');
        table.append(createElement(doc, 'div', 'extended-sudoku-corner', '×'));
        for (const column of sudokuState.columns || []) {
            table.append(createElement(doc, 'div', 'extended-sudoku-criterion extended-sudoku-column', column.label));
        }
        for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
            table.append(createElement(
                doc,
                'div',
                'extended-sudoku-criterion extended-sudoku-row',
                sudokuState.rows?.[rowIndex]?.label || ''
            ));
            for (let columnIndex = 0; columnIndex < 3; columnIndex++) {
                const cellIndex = rowIndex * 3 + columnIndex;
                const placement = sudokuState.placements?.[cellIndex] || null;
                const button = createElement(
                    doc,
                    'button',
                    `extended-sudoku-cell${state.activeSudokuCell === cellIndex ? ' is-active' : ''}${placement ? ' is-filled' : ''}`,
                    placement?.name || 'Alege pilot'
                );
                button.type = 'button';
                button.dataset.cellIndex = String(cellIndex);
                button.disabled = Boolean(placement);
                button.setAttribute('role', 'gridcell');
                button.setAttribute('aria-label', placement
                    ? `Celulă completată cu ${placement.name}`
                    : `Celulă rând ${rowIndex + 1}, coloană ${columnIndex + 1}`);
                button.addEventListener('click', () => {
                    state.activeSudokuCell = cellIndex;
                    renderSudoku(state.serverState?.sudoku);
                    elements.input.focus();
                    setStatus(`Celula ${rowIndex + 1}×${columnIndex + 1}: alege un pilot care respectă ambele criterii.`);
                });
                table.append(button);
            }
        }
        elements.sudoku.append(table);
        setVisible(elements.sudoku, true);
        elements.guessLabel.textContent = Number.isInteger(state.activeSudokuCell)
            ? `Pilot pentru celula ${Math.floor(state.activeSudokuCell / 3) + 1}×${(state.activeSudokuCell % 3) + 1}`
            : 'Selectează o celulă, apoi un pilot';
    }

    function renderRound() {
        const round = state.serverState?.round || {};
        comparisonBoard?.syncRound({
            variantKey: state.variantKey,
            entityType: VARIANT_COPY[state.variantKey]?.comparisonEntityType,
            maxAttempts: round.maxAttempts
        });
        renderHud();
        renderTrackClue(round.clue);
        elements.skip.hidden = !['speed-run', 'weekly'].includes(state.variantKey) || Boolean(round.awaitingAdvance);
        elements.continueButton.hidden = !round.awaitingAdvance;
        elements.submit.disabled = Boolean(round.awaitingAdvance);
        elements.input.disabled = Boolean(round.awaitingAdvance);
        if (state.variantKey === 'pilot-sudoku') {
            setVisible(elements.clue, false);
            renderSudoku(state.serverState?.sudoku);
        } else {
            setVisible(elements.sudoku, false);
        }
    }

    function renderEraSetup() {
        elements.setup.replaceChildren();
        const copy = createElement(doc, 'div', 'extended-era-copy');
        copy.append(
            createElement(doc, 'h3', '', 'Alege era piloților'),
            createElement(doc, 'p', '', 'Filtrul folosește anul debutului din catalogul jocului.')
        );
        const grid = createElement(doc, 'div', 'extended-era-grid');
        for (const era of ERA_OPTIONS) {
            const button = createElement(doc, 'button', 'extended-era-option');
            button.type = 'button';
            button.dataset.eraKey = era.key;
            button.append(
                createElement(doc, 'strong', '', era.title),
                createElement(doc, 'span', '', era.description)
            );
            button.addEventListener('click', () => {
                setStatus('Se generează provocarea...');
                emit('startExtendedMode', { variantKey: 'era', options: { eraKey: era.key } });
            });
            grid.append(button);
        }
        elements.setup.append(copy, grid);
        setVisible(elements.setup, true);
        setVisible(elements.game, false);
    }

    function renderWeeklySetup() {
        clearWeeklyCountdown();
        const view = renderWeeklySetupView({
            documentObject: doc,
            setupElement: elements.setup,
            status: state.weeklyStatus || {},
            pending: state.weeklyStartPending,
            onSelectDifficulty(option) {
                state.weeklyStartPending = true;
                renderWeeklySetup();
                setStatus(`Se rezervă Weekly Challenge ${option.title}...`);
                emit('startExtendedMode', {
                    variantKey: 'weekly',
                    options: { difficulty: option.key }
                });
            },
            onLogin() {
                close({ notifyServer: false });
                doc.getElementById('authOpenBtn')?.click?.();
            }
        });
        setVisible(elements.setup, true);
        setVisible(elements.game, false);
        setStatus(view.statusMessage, view.statusKind);
        startWeeklyCountdown(view.resetInfo);
    }

    function resetGameSurface() {
        clearTimer();
        state.catalog = [];
        state.serverState = null;
        state.activeSudokuCell = null;
        state.weeklyStartPending = false;
        state.hasStarted = false;
        comparisonBoard?.clear();
        elements.resultStats.replaceChildren();
        setVisible(elements.result, false);
        setVisible(elements.setup, false);
        setVisible(elements.game, true);
        elements.continueButton.hidden = true;
        elements.skip.hidden = true;
        elements.restart.hidden = false;
        elements.submit.disabled = false;
        elements.input.disabled = false;
        resetInput();
        setStatus('Se pregătește sesiunea...');
    }

    function updateRecords(payload) {
        const key = payload.variantKey || state.variantKey;
        const previous = state.records[key] || {};
        const next = {
            ...previous,
            bestScore: Math.max(Number(previous.bestScore) || 0, Number(payload.score) || 0),
            plays: (Number(previous.plays) || 0) + 1
        };
        if (key === 'streak') {
            next.bestStreak = Math.max(Number(previous.bestStreak) || 0, Number(payload.streak) || 0);
        }
        if (payload.reason === 'completed' && Number(payload.durationMs) > 0) {
            next.fastestDurationMs = previous.fastestDurationMs
                ? Math.min(Number(previous.fastestDurationMs), Number(payload.durationMs))
                : Number(payload.durationMs);
        }
        if (payload.challengeId) next.lastChallengeId = payload.challengeId;
        state.records[key] = next;
        writeRecords(storage || win?.localStorage, state.records);
        return next;
    }

    function createStat(label, value) {
        const item = createElement(doc, 'div');
        item.append(createElement(doc, 'span', '', label), createElement(doc, 'strong', '', value));
        return item;
    }

    function handleStarted(payload = {}) {
        if (!state.isOpen || payload.variantKey !== state.variantKey) return;
        clearWeeklyCountdown();
        state.hasStarted = true;
        state.weeklyStartPending = false;
        state.catalog = Array.isArray(payload.catalog) ? payload.catalog : [];
        state.serverState = payload.state || null;
        state.activeSudokuCell = null;
        comparisonBoard?.startRound({
            variantKey: state.variantKey,
            entityType: VARIANT_COPY[state.variantKey]?.comparisonEntityType,
            maxAttempts: state.serverState?.round?.maxAttempts
        });
        setVisible(elements.setup, false);
        setVisible(elements.game, true);
        setVisible(elements.result, false);
        elements.submit.disabled = false;
        elements.input.disabled = false;
        renderRound();
        const message = state.variantKey === 'pilot-sudoku'
            ? 'Selectează o celulă și completează grila cu nouă piloți diferiți.'
            : state.variantKey === 'track'
                ? 'Privește silueta, apoi selectează circuitul.'
                : 'Alege un răspuns din listă și folosește culorile pentru următoarea încercare.';
        setStatus(message);
        elements.input.focus();
    }

    function handleGuessResult(payload = {}) {
        if (!state.isOpen || payload.variantKey !== state.variantKey) return;
        appendFeedback(payload.feedback);
        if (payload.state) state.serverState = payload.state;
        renderHud();
        elements.submit.disabled = false;
        elements.input.disabled = false;

        if (payload.roundComplete) {
            if (payload.state) state.serverState = payload.state;
            renderRound();
            setStatus(payload.isCorrect
                ? `Corect! ${payload.target?.name || 'Ținta'} · +${Number(payload.points || 0).toLocaleString('ro-RO')} puncte.`
                : `Runda s-a încheiat. Răspunsul era ${payload.target?.name || 'necunoscut'}.`,
            payload.isCorrect ? 'success' : 'warning');
        } else {
            setStatus('Nu este ținta. Folosește comparațiile și încearcă din nou.', 'warning');
            resetInput();
            elements.input.focus();
        }
    }

    function handleRoundResult(payload = {}) {
        if (!state.isOpen || payload.variantKey !== state.variantKey) return;
        state.serverState = payload.state || state.serverState;
        renderRound();
        setStatus(`Rundă sărită. Răspunsul era ${payload.target?.name || 'necunoscut'}.`, 'warning');
    }

    function handleRoundReady(payload = {}) {
        if (!state.isOpen || payload.variantKey !== state.variantKey) return;
        state.serverState = payload.state || null;
        comparisonBoard?.startRound({
            variantKey: state.variantKey,
            entityType: VARIANT_COPY[state.variantKey]?.comparisonEntityType,
            maxAttempts: state.serverState?.round?.maxAttempts
        });
        elements.continueButton.hidden = true;
        elements.submit.disabled = false;
        elements.input.disabled = false;
        resetInput();
        renderRound();
        setStatus('Rundă nouă. Cronometrul total continuă.');
        elements.input.focus();
    }

    function handleSudokuUpdate(payload = {}) {
        if (!state.isOpen || payload.variantKey !== state.variantKey) return;
        state.serverState = payload.state || state.serverState;
        elements.submit.disabled = false;
        if (payload.correct) {
            state.activeSudokuCell = null;
            setStatus(`${payload.driver?.name || 'Pilotul'} se potrivește.`, 'success');
        } else {
            setStatus('Pilotul nu respectă ambele criterii. −25 puncte.', 'error');
        }
        renderHud();
        renderSudoku(state.serverState?.sudoku);
        resetInput();
    }

    function handleFinished(payload = {}) {
        if (!state.isOpen || payload.variantKey !== state.variantKey) return;
        clearTimer();
        state.serverState = null;
        elements.submit.disabled = true;
        elements.input.disabled = true;
        elements.skip.hidden = true;
        elements.continueButton.hidden = true;
        const record = updateRecords(payload);

        const completed = payload.reason === 'completed';
        const timedOut = payload.reason === 'time-expired';
        elements.resultTitle.textContent = completed
            ? '🏁 Provocare finalizată!'
            : timedOut
                ? '⏱️ Timp expirat'
                : payload.reason === 'streak-ended'
                    ? '🔥 Seria s-a încheiat'
                    : 'Sesiune finalizată';
        elements.resultMessage.textContent = state.variantKey === 'weekly'
            ? `Scorul oficial a fost salvat pentru ${payload.difficulty || 'dificultatea aleasă'}. Următoarea încercare devine disponibilă în ${getWeeklyCountdownText()}.`
            : payload.target?.name
                ? `Ultimul răspuns era ${payload.target.name}.`
                : state.variantKey === 'pilot-sudoku'
                    ? 'Ai completat toate cele nouă celule.'
                    : 'Rezultatul a fost salvat local.';
        elements.resultStats.replaceChildren(
            createStat('Scor', Number(payload.score || 0).toLocaleString('ro-RO')),
            createStat('Record', Number(record.bestScore || 0).toLocaleString('ro-RO')),
            createStat(state.variantKey === 'streak' ? 'Streak' : 'Runde corecte', state.variantKey === 'streak'
                ? String(payload.streak || 0)
                : `${payload.roundsCompleted || 0}/${payload.totalRounds || payload.roundsPlayed || 1}`),
            createStat('Durată', formatDuration(payload.durationMs))
        );
        elements.restart.hidden = state.variantKey === 'weekly';
        setVisible(elements.result, true);
        setStatus(state.variantKey === 'weekly'
            ? 'Încercarea Weekly a fost consumată. Revino după resetul săptămânal.'
            : 'Poți relua același mod sau reveni la Game Hub.');
        elements.result.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        (state.variantKey === 'weekly' ? elements.home : elements.restart).focus();
    }

    function handleWeeklyStatus(payload = {}) {
        state.weeklyStatus = payload && typeof payload === 'object' ? payload : null;
        state.weeklyStartPending = false;
        if (state.isOpen && state.variantKey === 'weekly' && !state.hasStarted) {
            renderWeeklySetup();
        }
    }

    function handleError(message) {
        if (!state.isOpen) return;
        elements.submit.disabled = false;
        elements.input.disabled = false;
        state.weeklyStartPending = false;
        if (state.variantKey === 'weekly' && !state.hasStarted) renderWeeklySetup();
        setStatus(message || 'Acțiunea nu a putut fi efectuată.', 'error');
    }

    async function open(variantKey, { trigger = null } = {}) {
        if (!VARIANT_COPY[variantKey]) throw new Error(`Unknown extended mode: ${variantKey}`);
        state.variantKey = variantKey;
        state.trigger = trigger || doc.activeElement;
        state.isOpen = true;
        resetGameSurface();
        updateHeader();

        const difficultyOverlay = doc.getElementById('difficulty-overlay');
        difficultyOverlay?.classList?.add('hidden');
        backdrop.hidden = false;
        backdrop.setAttribute('aria-hidden', 'false');
        panel.hidden = false;
        doc.body.classList.add('extended-mode-open');
        panel.focus();

        const socket = await waitForSocket();
        if (!socket) {
            setStatus('Serverul nu este conectat. Pornește aplicația și reîncarcă pagina.', 'error');
            return false;
        }
        bindSocket(socket);

        if (variantKey === 'era') {
            renderEraSetup();
            setStatus('Alege perioada istorică.');
            return true;
        }
        if (variantKey === 'weekly') {
            state.weeklyStatus = null;
            renderWeeklySetup();
            setStatus('Se verifică disponibilitatea încercării Weekly...');
            emit('requestWeeklyChallengeStatus');
            return true;
        }

        emit('startExtendedMode', { variantKey, options: {} });
        return true;
    }

    function close({ notifyServer = true } = {}) {
        if (!state.isOpen) return;
        if (notifyServer) emit('leaveExtendedMode');
        clearTimer();
        clearWeeklyCountdown();
        state.isOpen = false;
        state.variantKey = null;
        state.catalog = [];
        state.serverState = null;
        state.activeSudokuCell = null;
        state.weeklyStatus = null;
        state.weeklyStartPending = false;
        state.hasStarted = false;
        autocomplete.clearSuggestions();
        panel.hidden = true;
        backdrop.hidden = true;
        backdrop.setAttribute('aria-hidden', 'true');
        doc.body.classList.remove('extended-mode-open');
        doc.getElementById('difficulty-overlay')?.classList?.remove('hidden');
        state.trigger?.focus?.();
    }

    function handleKeyDown(event) {
        if (!state.isOpen || panel.getAttribute('aria-modal') !== 'true') return;
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled])')]
            .filter(element => !element.hidden && element.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && doc.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    const controller = {
        close,
        handleError,
        handleFinished,
        handleGuessResult,
        handleRoundReady,
        handleRoundResult,
        handleStarted,
        handleSudokuUpdate,
        handleWeeklyStatus,
        open,
        _state: state,
        _elements: elements,
        _comparisonBoard: comparisonBoard
    };

    elements.close.addEventListener('click', () => close());
    backdrop.addEventListener('click', () => close());
    elements.input.addEventListener('input', autocomplete.renderSuggestions);
    elements.input.addEventListener('keydown', autocomplete.handleKeydown);
    elements.submit.addEventListener('click', submitGuess);
    elements.skip.addEventListener('click', () => emit('skipExtendedRound'));
    elements.continueButton.addEventListener('click', () => emit('continueExtendedMode'));
    elements.restart.addEventListener('click', () => {
        resetGameSurface();
        emit('restartExtendedMode');
    });
    elements.home.addEventListener('click', () => close());
    doc.addEventListener('keydown', handleKeyDown);
    doc.addEventListener('click', event => {
        if (!state.isOpen) return;
        if (event.target?.id === 'siteHomeControl' || event.target?.dataset?.level === 'home') {
            close();
        }
        if (!elements.suggestions.contains(event.target) && event.target !== elements.input) autocomplete.clearSuggestions();
    }, true);

    return controller;
}

export function installExtendedModesController(windowObject = globalThis.window) {
    if (!windowObject?.document) return null;
    if (windowObject.__f1ExtendedModesController) return windowObject.__f1ExtendedModesController;
    const controller = createExtendedModesController({
        windowObject,
        documentObject: windowObject.document,
        storage: windowObject.localStorage
    });
    windowObject.__f1ExtendedModesController = controller;
    return controller;
}

export {
    ERA_OPTIONS,
    RECORDS_KEY,
    STYLE_URL,
    VARIANT_COPY,
    createExtendedModesController,
    formatDuration,
    normalizeName,
    readRecords,
    writeRecords
};
