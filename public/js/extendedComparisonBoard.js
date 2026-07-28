const DRIVER_SCHEMA = Object.freeze([
    Object.freeze({ key: 'name', label: 'Pilot' }),
    Object.freeze({ key: 'nat', label: 'Țară' }),
    Object.freeze({ key: 'team', label: 'Echipă' }),
    Object.freeze({ key: 'age', label: 'Vârstă', directional: true }),
    Object.freeze({ key: 'debut', label: 'Debut', directional: true }),
    Object.freeze({ key: 'wins', label: 'Victorii', directional: true })
]);

const CONSTRUCTOR_SCHEMA = Object.freeze([
    Object.freeze({ key: 'name', label: 'Constructor' }),
    Object.freeze({ key: 'country', label: 'Țară' }),
    Object.freeze({ key: 'debut', label: 'Debut', directional: true }),
    Object.freeze({ key: 'championships', label: 'Titluri', directional: true }),
    Object.freeze({ key: 'active', label: 'Status' }),
    Object.freeze({ key: 'era', label: 'Eră' })
]);

const ENTITY_SCHEMAS = Object.freeze({
    driver: DRIVER_SCHEMA,
    constructor: CONSTRUCTOR_SCHEMA
});

const EXCLUDED_VARIANTS = new Set(['pilot-sudoku', 'track']);
const DRIVER_VARIANTS = new Set(['speed-run', 'era', 'streak', 'weekly']);
const VALID_STATES = new Set(['green', 'yellow', 'orange', 'purple', 'red']);

function normalizeEntityType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITY_SCHEMAS, normalized) ? normalized : '';
}

function resolveComparisonEntityType({ variantKey = '', entityType = '' } = {}) {
    const normalizedVariant = String(variantKey || '').trim().toLowerCase();
    if (EXCLUDED_VARIANTS.has(normalizedVariant)) return '';

    const normalizedEntityType = normalizeEntityType(entityType);
    if (normalizedEntityType) return normalizedEntityType;
    if (normalizedVariant === 'constructor') return 'constructor';
    return DRIVER_VARIANTS.has(normalizedVariant) ? 'driver' : '';
}

function resolveComparisonSchema(options = {}) {
    const entityType = resolveComparisonEntityType(options);
    return entityType ? ENTITY_SCHEMAS[entityType] : null;
}

function normalizeMaxAttempts(value, fallback = 6) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, 12);
}

function normalizeCellState(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return VALID_STATES.has(normalized) ? normalized : 'red';
}

function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text);
    return element;
}

function getDirectionalArrow(state) {
    if (state === 'orange') return '↑';
    if (state === 'purple') return '↓';
    return '';
}

function getDirectionalLabel(state) {
    if (state === 'orange') return 'valoarea țintă este mai mare';
    if (state === 'purple') return 'valoarea țintă este mai mică';
    return '';
}

function createHeaderRow(documentObject, schema) {
    const row = createElement(documentObject, 'div', 'extended-classic-board-row extended-classic-board-header');
    row.setAttribute('role', 'row');

    const attemptHeader = createElement(documentObject, 'div', 'extended-classic-board-cell extended-classic-board-attempt', '#');
    attemptHeader.setAttribute('role', 'columnheader');
    row.append(attemptHeader);

    for (const column of schema) {
        const cell = createElement(documentObject, 'div', 'extended-classic-board-cell', column.label);
        cell.setAttribute('role', 'columnheader');
        row.append(cell);
    }
    return row;
}

function createEmptyCell(documentObject, column, attemptNumber) {
    const cell = createElement(documentObject, 'div', 'extended-classic-board-cell is-empty');
    cell.setAttribute('role', 'cell');
    cell.setAttribute('aria-label', `Încercarea ${attemptNumber}, ${column.label}: necompletat`);
    return cell;
}

function createFeedbackCell(documentObject, column, feedbackCell, attemptNumber) {
    if (!feedbackCell) return createEmptyCell(documentObject, column, attemptNumber);

    const state = normalizeCellState(feedbackCell.state);
    const cell = createElement(documentObject, 'div', `extended-classic-board-cell state-${state}`);
    cell.setAttribute('role', 'cell');

    const valueText = feedbackCell.value ?? '—';
    const directionLabel = column.directional ? getDirectionalLabel(state) : '';
    cell.setAttribute(
        'aria-label',
        `Încercarea ${attemptNumber}, ${column.label}: ${valueText}${directionLabel ? `, ${directionLabel}` : ''}`
    );

    const value = createElement(documentObject, 'strong', 'extended-classic-board-value', valueText);
    cell.append(value);

    if (column.directional) {
        const arrow = getDirectionalArrow(state);
        if (arrow) {
            const direction = state === 'orange' ? 'up' : 'down';
            cell.classList.add('has-direction');
            const indicator = createElement(
                documentObject,
                'span',
                `extended-classic-board-arrow is-${direction}`,
                arrow
            );
            indicator.setAttribute('aria-hidden', 'true');
            cell.append(indicator);
        }
    }
    return cell;
}

function createAttemptRow(documentObject, schema, feedback, attemptNumber, { animate = false } = {}) {
    const completed = Boolean(feedback);
    const row = createElement(
        documentObject,
        'div',
        `extended-classic-board-row${completed ? ' is-completed' : ''}${completed && animate ? ' is-revealing' : ''}`
    );
    row.setAttribute('role', 'row');

    const attemptCell = createElement(
        documentObject,
        'div',
        'extended-classic-board-cell extended-classic-board-attempt',
        attemptNumber
    );
    attemptCell.setAttribute('role', 'rowheader');
    attemptCell.setAttribute('aria-label', `Încercarea ${attemptNumber}`);
    row.append(attemptCell);

    const feedbackCells = new Map(
        (Array.isArray(feedback?.cells) ? feedback.cells : [])
            .filter(cell => cell && typeof cell.key === 'string')
            .map(cell => [cell.key, cell])
    );
    for (const column of schema) {
        row.append(createFeedbackCell(documentObject, column, feedbackCells.get(column.key), attemptNumber));
    }
    return row;
}

function createExtendedComparisonBoard({ documentObject, root } = {}) {
    if (!documentObject || !root) return null;

    let variantKey = '';
    let entityType = '';
    let schema = null;
    let maxAttempts = 6;
    let feedbackRows = [];

    function clearBoardMarkup() {
        root.replaceChildren();
        root.classList.remove('extended-classic-board');
        root.hidden = false;
        root.removeAttribute?.('role');
        root.removeAttribute?.('aria-label');
    }

    function render({ animateNewest = false } = {}) {
        if (!schema) return false;

        root.replaceChildren();
        root.classList.add('extended-classic-board');
        root.hidden = false;
        root.setAttribute('role', 'table');
        root.setAttribute('aria-label', 'Istoricul încercărilor');
        root.append(createHeaderRow(documentObject, schema));

        const newestFeedbackIndex = feedbackRows.length - 1;
        for (let index = 0; index < maxAttempts; index++) {
            root.append(createAttemptRow(
                documentObject,
                schema,
                feedbackRows[index] || null,
                index + 1,
                { animate: animateNewest && index === newestFeedbackIndex }
            ));
        }
        return true;
    }

    function syncRound(options = {}) {
        const nextVariantKey = String(options.variantKey || variantKey || '').trim().toLowerCase();
        const nextEntityType = resolveComparisonEntityType({
            variantKey: nextVariantKey,
            entityType: options.entityType || entityType
        });
        const nextSchema = nextEntityType ? ENTITY_SCHEMAS[nextEntityType] : null;
        const nextMaxAttempts = normalizeMaxAttempts(options.maxAttempts, maxAttempts || 6);
        const wasEnabled = Boolean(schema);
        const variantChanged = nextVariantKey !== variantKey;
        const schemaChanged = nextEntityType !== entityType;
        const maxAttemptsChanged = nextMaxAttempts !== maxAttempts;

        variantKey = nextVariantKey;
        entityType = nextEntityType;
        schema = nextSchema;
        maxAttempts = nextMaxAttempts;
        if (variantChanged || schemaChanged) feedbackRows = [];
        if (feedbackRows.length > maxAttempts) feedbackRows = feedbackRows.slice(0, maxAttempts);
        if (!schema) {
            if (wasEnabled) clearBoardMarkup();
            return false;
        }
        if (!variantChanged && !schemaChanged && !maxAttemptsChanged) return true;
        return render();
    }

    function startRound(options = {}) {
        feedbackRows = [];
        variantKey = '';
        entityType = '';
        schema = null;
        maxAttempts = 6;
        clearBoardMarkup();
        return syncRound(options);
    }

    function appendFeedback(feedback) {
        if (!feedback || typeof feedback !== 'object') return false;
        if (!schema) {
            syncRound({ variantKey, entityType: feedback.entityType, maxAttempts });
        }
        if (!schema || feedbackRows.length >= maxAttempts) return false;
        feedbackRows.push(feedback);
        render({ animateNewest: true });
        return true;
    }

    function clear() {
        variantKey = '';
        entityType = '';
        schema = null;
        maxAttempts = 6;
        feedbackRows = [];
        clearBoardMarkup();
        return false;
    }

    return {
        appendFeedback,
        clear,
        render,
        startRound,
        syncRound,
        getSnapshot() {
            return {
                enabled: Boolean(schema),
                entityType,
                maxAttempts,
                feedbackCount: feedbackRows.length,
                variantKey
            };
        }
    };
}

export {
    CONSTRUCTOR_SCHEMA,
    DRIVER_SCHEMA,
    ENTITY_SCHEMAS,
    createExtendedComparisonBoard,
    getDirectionalArrow,
    getDirectionalLabel,
    normalizeCellState,
    normalizeMaxAttempts,
    resolveComparisonEntityType,
    resolveComparisonSchema
};
