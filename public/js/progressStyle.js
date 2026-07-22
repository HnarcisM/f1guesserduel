const PROGRESS_CLASS_PREFIX = 'progress-percent-';

export function normalizeProgressPercent(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.round(Math.min(100, Math.max(0, numericValue)));
}

/**
 * Aplică o valoare procentuală folosind exclusiv clase CSS predefinite.
 * Valorile sunt limitate la 0-100, astfel încât datele runtime nu pot injecta CSS.
 */
export function setProgressPercent(element, value) {
    const percent = normalizeProgressPercent(value);
    if (!element) return percent;

    const nextValue = String(percent);
    const previousValue = element.dataset.progressPercent;
    if (previousValue === nextValue) return percent;

    if (/^(?:100|[1-9]?\d)$/.test(previousValue || '')) {
        element.classList.remove(`${PROGRESS_CLASS_PREFIX}${previousValue}`);
    }

    element.classList.add('has-progress-percent', `${PROGRESS_CLASS_PREFIX}${nextValue}`);
    element.dataset.progressPercent = nextValue;
    return percent;
}
