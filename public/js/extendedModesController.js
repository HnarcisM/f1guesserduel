import { createExtendedComparisonBoard } from './extendedComparisonBoard.js';
import { createExtendedModeAutocomplete } from './extendedModeAutocomplete.js';
import { ERA_OPTIONS, RECORDS_KEY, STYLE_URL, VARIANT_COPY } from './extendedModesConfig.js';
import { createExtendedModesRenderer } from './extendedModesRenderer.js';
import {
    createExtendedModesRuntime,
    formatDuration,
    normalizeName,
    readRecords,
    writeRecords
} from './extendedModesRuntime.js';
import {
    collectExtendedModeElements,
    createShell,
    ensureStylesheet,
    setVisible
} from './extendedModesView.js';

function createExtendedModesController({ windowObject, documentObject, storage } = {}) {
    const win = windowObject || globalThis.window;
    const doc = documentObject || win?.document;
    if (!doc) return null;

    ensureStylesheet(doc);
    const shell = createShell(doc);
    const { backdrop, panel } = shell;
    const elements = collectExtendedModeElements(shell);

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

    const {
        bindSocket,
        clearTimer,
        clearWeeklyCountdown,
        emit,
        getWeeklyCountdownText,
        startWeeklyCountdown,
        syncTimer,
        waitForSocket
    } = createExtendedModesRuntime({
        windowObject: win,
        elements,
        state,
        setStatus,
        getController: () => controller
    });

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

    function updateHeader() {
        const copy = VARIANT_COPY[state.variantKey] || VARIANT_COPY['speed-run'];
        elements.eyebrow.textContent = copy.eyebrow;
        elements.title.textContent = copy.title;
        elements.description.textContent = copy.description;
    }

    const {
        appendFeedback,
        createStat,
        renderEraSetup,
        renderHud,
        renderRound,
        renderSudoku,
        renderWeeklySetup,
        resetGameSurface,
        updateRecords
    } = createExtendedModesRenderer({
        windowObject: win,
        documentObject: doc,
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
    });

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
