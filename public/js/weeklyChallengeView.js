export const WEEKLY_DIFFICULTY_OPTIONS = Object.freeze([
    { key: 'easy', title: 'Easy', icon: '🟢', description: 'Piloți după 2010 · Generația nouă' },
    { key: 'medium', title: 'Medium', icon: '🟡', description: 'Piloți 2000–2010 · Epoca V10 și V8' },
    { key: 'hard', title: 'Hard', icon: '🔴', description: 'Piloți 1950–2000 · Panteonul istoric' }
]);

function createElement(documentObject, tagName, className = '', text = '') {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text);
    return element;
}

export function formatWeeklyCountdown(status, now = Date.now()) {
    const resetAt = Date.parse(status?.nextResetAt || '');
    const remainingMs = Number.isFinite(resetAt) ? Math.max(0, resetAt - now) : 0;
    const totalSeconds = Math.floor(remainingMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${days}z ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function updateWeeklyResetInfo(infoElement, status, now = Date.now()) {
    if (!infoElement) return;
    const prefix = status?.claimed
        ? 'Încercarea săptămânală a fost folosită. Reset în'
        : 'Resetul provocării are loc în';
    infoElement.textContent = `${prefix} ${formatWeeklyCountdown(status, now)}.`;
}

export function renderWeeklySetupView({
    documentObject,
    setupElement,
    status = {},
    pending = false,
    onSelectDifficulty,
    onLogin
}) {
    setupElement.replaceChildren();
    const copy = createElement(documentObject, 'div', 'extended-weekly-copy');
    copy.append(
        createElement(documentObject, 'h3', '', 'Alege dificultatea încercării oficiale'),
        createElement(
            documentObject,
            'p',
            '',
            'Alegerea consumă singura încercare Weekly a contului pentru această săptămână. Toți jucătorii de pe aceeași dificultate primesc aceiași cinci piloți.'
        )
    );

    const resetInfo = createElement(documentObject, 'p', 'extended-weekly-reset');
    updateWeeklyResetInfo(resetInfo, status);
    const grid = createElement(documentObject, 'div', 'extended-weekly-grid');
    const unavailable = !status.authenticated || Boolean(status.claimed) || pending;

    for (const option of WEEKLY_DIFFICULTY_OPTIONS) {
        const selected = status.claimed && status.difficulty === option.key;
        const button = createElement(
            documentObject,
            'button',
            `extended-weekly-option ${option.key}${selected ? ' is-claimed' : ''}`
        );
        button.type = 'button';
        button.dataset.weeklyDifficulty = option.key;
        button.disabled = unavailable;
        button.setAttribute('aria-disabled', String(unavailable));
        button.append(
            createElement(documentObject, 'span', 'extended-weekly-icon', selected ? '✅' : option.icon),
            createElement(documentObject, 'strong', '', `${option.title}${selected ? ' · jucat' : ''}`),
            createElement(documentObject, 'small', '', option.description)
        );
        button.addEventListener('click', () => {
            if (!button.disabled) onSelectDifficulty?.(option);
        });
        grid.append(button);
    }

    const actions = createElement(documentObject, 'div', 'extended-weekly-actions');
    let statusMessage = 'Alege cu atenție dificultatea: încercarea nu poate fi reluată.';
    let statusKind = 'warning';
    if (!status.authenticated) {
        const login = createElement(documentObject, 'button', 'extended-primary-btn', 'Autentifică-te');
        login.type = 'button';
        login.addEventListener('click', () => onLogin?.());
        actions.append(login);
        statusMessage = 'Autentifică-te pentru a debloca Weekly Challenge.';
    } else if (status.claimed) {
        const resultText = status.result
            ? `Scor salvat: ${Number(status.result.score || 0).toLocaleString('ro-RO')} · ${status.result.roundsCompleted || 0}/${status.result.roundsPlayed || 0} runde corecte.`
            : 'Încercarea a fost deja pornită în această săptămână.';
        actions.append(createElement(documentObject, 'p', 'extended-weekly-result-summary', resultText));
        statusMessage = 'Weekly Challenge revine la următorul reset săptămânal.';
    }

    setupElement.append(copy, resetInfo, grid, actions);
    return { resetInfo, statusMessage, statusKind };
}
