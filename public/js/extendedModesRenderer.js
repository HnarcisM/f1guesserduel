import { setProgressPercent } from './progressStyle.js';
import { renderWeeklySetupView } from './weeklyChallengeView.js';
import { ERA_OPTIONS, VARIANT_COPY } from './extendedModesConfig.js';
import { formatDuration, writeRecords } from './extendedModesRuntime.js';
import { createElement, setVisible } from './extendedModesView.js';

export function createExtendedModesRenderer({
    windowObject,
    documentObject,
    elements,
    state,
    comparisonBoard,
    storage,
    emit,
    setStatus,
    resetInput,
    syncTimer,
    clearTimer,
    clearWeeklyCountdown,
    startWeeklyCountdown,
    close
}) {
    const win = windowObject;
    const doc = documentObject;

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

    return {
        appendFeedback,
        createStat,
        renderEraSetup,
        renderHud,
        renderRound,
        renderSudoku,
        renderTrackClue,
        renderWeeklySetup,
        resetGameSurface,
        updateRecords,
        formatDuration
    };
}
