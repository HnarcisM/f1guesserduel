import { createTextElement } from './domUtils.js';
import { getIsoCode, getLocalTeamLogoPath, handleFlagError, handleTeamLogoError } from './assets.js';

const RESULT_FIELDS = [
    { key: 'name', label: 'Pilot' },
    { key: 'nat', label: 'Țară' },
    { key: 'team', label: 'Echipă' },
    { key: 'age', label: 'Vârstă' },
    { key: 'debut', label: 'Debut' },
    { key: 'wins', label: 'Wins' }
];

function normalizePlayers(board) {
    return Array.isArray(board?.players) ? board.players.slice(0, 2) : [];
}

function clearNode(node) {
    if (node) node.replaceChildren();
}


function renderFallbackMessage(message) {
    const container = document.getElementById('liveDuelBoard');
    const playersContainer = document.getElementById('liveDuelPlayers');
    const summary = document.getElementById('liveDuelSummary');
    if (!container || !playersContainer) return;

    container.classList.remove('is-hidden');
    clearNode(playersContainer);
    if (summary) summary.textContent = message;
    playersContainer.appendChild(createTextElement('p', 'live-empty-message', message));
}

function createStatusLabel(player) {
    if (!player) return 'Slot liber';
    if (player.timedOut) return 'Timp expirat';
    if (player.finished) return 'Terminat';
    return 'În joc';
}

function createResultPill(field, guess, results = {}) {
    const resultClass = results[field.key] || 'pending';
    const pill = document.createElement('div');
    pill.className = `live-guess-pill ${resultClass}`;
    pill.title = field.label;

    pill.appendChild(createTextElement('span', 'live-guess-label', field.label));

    if (field.key === 'nat') {
        const isoCode = getIsoCode(guess.nat);
        const flag = document.createElement('img');
        flag.className = 'live-guess-flag';
        flag.src = `/flags/${isoCode}.svg`;
        flag.alt = guess.nat || 'Țară';
        flag.onerror = () => handleFlagError(flag, isoCode, 0);
        pill.append(flag, createTextElement('span', 'live-guess-value', guess.nat || '-'));
        return pill;
    }

    if (field.key === 'team') {
        const teamName = Array.isArray(guess.team) ? guess.team[0] : guess.team;
        const logo = document.createElement('img');
        logo.className = 'live-guess-team-logo';
        logo.src = getLocalTeamLogoPath(teamName) || '/logos/F1.svg';
        logo.alt = teamName || 'Echipă';
        logo.onerror = () => handleTeamLogoError(logo, teamName, 0);
        pill.append(logo, createTextElement('span', 'live-guess-value', teamName || '-'));
        return pill;
    }

    const value = field.key === 'name'
        ? guess.name
        : guess[field.key];
    pill.appendChild(createTextElement('span', 'live-guess-value', value ?? '-'));
    return pill;
}

function createGuessRow(entry) {
    const row = document.createElement('article');
    row.className = 'live-guess-row';

    const meta = document.createElement('div');
    meta.className = 'live-guess-meta';
    meta.append(
        createTextElement('span', 'live-guess-attempt', `#${entry.attempt || '?'}`),
        createTextElement('strong', 'live-guess-driver-name', entry.guess?.name || 'Pilot necunoscut')
    );

    const cells = document.createElement('div');
    cells.className = 'live-guess-cells';

    for (const field of RESULT_FIELDS) {
        cells.appendChild(createResultPill(field, entry.guess || {}, entry.results || {}));
    }

    row.append(meta, cells);
    return row;
}

function createPlayerCard(player, index) {
    const card = document.createElement('article');
    card.className = 'live-player-card';
    if (!player) card.classList.add('empty');

    const header = document.createElement('div');
    header.className = 'live-player-header';

    const titleWrap = document.createElement('div');
    titleWrap.append(
        createTextElement('p', 'live-player-label', `Player ${index + 1}`),
        createTextElement('h3', 'live-player-name', player?.username || 'Slot liber')
    );

    const status = createTextElement('span', 'live-player-status', createStatusLabel(player));
    if (player?.isHost) status.classList.add('host');
    if (player?.finished) status.classList.add('finished');
    if (player?.timedOut) status.classList.add('timed-out');

    header.append(titleWrap, status);
    card.appendChild(header);

    const guesses = Array.isArray(player?.guesses) ? player.guesses : [];
    const list = document.createElement('div');
    list.className = 'live-guess-list';

    if (!player) {
        list.appendChild(createTextElement('p', 'live-empty-message', 'Așteaptă al doilea jucător.'));
    } else if (guesses.length === 0) {
        list.appendChild(createTextElement('p', 'live-empty-message', 'Nicio încercare încă.'));
    } else {
        guesses.forEach(entry => list.appendChild(createGuessRow(entry)));
    }

    card.appendChild(list);
    return card;
}

export function renderLiveBoard(board, options = {}) {
    try {
        const container = document.getElementById('liveDuelBoard');
        const playersContainer = document.getElementById('liveDuelPlayers');
        const summary = document.getElementById('liveDuelSummary');
        if (!container || !playersContainer) return;

        const players = normalizePlayers(board);
        const forceVisible = Boolean(options.forceVisible);
        const hasRound = board?.roundState === 'playing' || players.some(player => (player.guesses || []).length > 0 || player.finished);
        const shouldShow = hasRound || forceVisible;

        container.classList.toggle('is-hidden', !shouldShow);
        clearNode(playersContainer);

        if (!shouldShow) {
            if (summary) summary.textContent = 'Așteaptă startul rundei...';
            return;
        }

        if (!hasRound) {
            if (summary) summary.textContent = 'Așteaptă sincronizarea duelului...';
            playersContainer.appendChild(createPlayerCard(players[0], 0));
            playersContainer.appendChild(createPlayerCard(players[1], 1));
            return;
        }

        const completed = players.filter(player => player.finished).length;
        const totalGuesses = players.reduce((sum, player) => sum + (Array.isArray(player.guesses) ? player.guesses.length : 0), 0);
        if (summary) {
            summary.textContent = `${totalGuesses} încercări · ${completed}/${players.length || 2} terminați`;
        }

        for (let index = 0; index < 2; index++) {
            playersContainer.appendChild(createPlayerCard(players[index], index));
        }
    } catch (error) {
        console.error('Live board render failed:', error, board);
        renderFallbackMessage('Live board-ul a primit date, dar randarea detaliată a eșuat. Verifică consola browserului.');
    }
}

export function resetLiveBoard() {
    renderLiveBoard({ roundState: 'waiting', players: [] });
}
