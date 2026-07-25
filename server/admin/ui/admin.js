'use strict';

const state = {
    activeView: 'dashboard',
    pendingAction: null,
    userSearch: '',
    adminUserId: null
};

const els = {
    identity: document.getElementById('adminIdentity'),
    pageTitle: document.getElementById('adminPageTitle'),
    refresh: document.getElementById('adminRefreshBtn'),
    status: document.getElementById('adminStatus'),
    metricGrid: document.getElementById('adminMetricGrid'),
    systemSummary: document.getElementById('adminSystemSummary'),
    userSearchForm: document.getElementById('adminUserSearchForm'),
    userSearch: document.getElementById('adminUserSearch'),
    usersBody: document.getElementById('adminUsersBody'),
    usersMeta: document.getElementById('adminUsersMeta'),
    roomsBody: document.getElementById('adminRoomsBody'),
    roomsMeta: document.getElementById('adminRoomsMeta'),
    auditBody: document.getElementById('adminAuditBody'),
    dialog: document.getElementById('adminConfirmDialog'),
    confirmForm: document.getElementById('adminConfirmForm'),
    confirmTitle: document.getElementById('adminConfirmTitle'),
    confirmMessage: document.getElementById('adminConfirmMessage'),
    confirmPassword: document.getElementById('adminConfirmPassword'),
    confirmError: document.getElementById('adminConfirmError'),
    confirmCancel: document.getElementById('adminConfirmCancel'),
    confirmSubmit: document.getElementById('adminConfirmSubmit')
};

const viewTitles = Object.freeze({
    dashboard: 'Dashboard',
    users: 'Utilizatori',
    rooms: 'Camere active',
    audit: 'Audit'
});

function setStatus(message = '', type = '') {
    els.status.textContent = message;
    els.status.className = `admin-status${type ? ` is-${type}` : ''}`;
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        },
        ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            setStatus(payload.message || 'Sesiunea administrativă nu mai este validă.', 'error');
        }
        throw new Error(payload.message || 'Cererea administrativă a eșuat.');
    }
    return payload;
}

function formatNumber(value) {
    return new Intl.NumberFormat('ro-RO').format(Number(value) || 0);
}

function formatDate(value) {
    if (!value) return 'Niciodată';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Dată necunoscută';
    return new Intl.DateTimeFormat('ro-RO', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Bucharest'
    }).format(date);
}

function createCell(text, secondary = null) {
    const cell = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = text;
    cell.appendChild(strong);
    if (secondary) {
        const small = document.createElement('small');
        small.textContent = secondary;
        cell.appendChild(small);
    }
    return cell;
}

function createEmptyRow(columnCount, message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columnCount;
    cell.className = 'admin-empty-row';
    cell.textContent = message;
    row.appendChild(cell);
    return row;
}

function renderMetrics(data) {
    const metrics = [
        ['Utilizatori', data.totalUsers],
        ['Activi în 24h', data.activeUsers24h],
        ['Sesiuni active', data.activeSessions],
        ['Camere active', data.activeRooms],
        ['Jocuri în 24h', data.gamesLast24h],
        ['Socket-uri conectate', data.connectedSockets],
        ['Daily astăzi', data.dailyAttemptsToday],
        ['Weekly săptămâna curentă', data.weeklyAttemptsCurrent]
    ];
    els.metricGrid.replaceChildren(...metrics.map(([label, value]) => {
        const card = document.createElement('article');
        card.className = 'admin-metric';
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        const valueEl = document.createElement('strong');
        valueEl.textContent = formatNumber(value);
        card.append(labelEl, valueEl);
        return card;
    }));

    const summary = [
        ['Ultima actualizare', formatDate(data.generatedAt)],
        ['Acces', 'Doar ID-urile configurate în ADMIN_USER_IDS'],
        ['Acțiuni destructive', 'Necesită reconfirmarea parolei'],
        ['Audit', 'Persistat în baza de date']
    ];
    els.systemSummary.replaceChildren(...summary.map(([term, description]) => {
        const wrapper = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = term;
        dd.textContent = description;
        wrapper.append(dt, dd);
        return wrapper;
    }));
}

async function loadDashboard() {
    renderMetrics(await api('/api/admin/overview'));
}

function openConfirmation({ title, message, submitLabel, action }) {
    state.pendingAction = action;
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmSubmit.textContent = submitLabel;
    els.confirmPassword.value = '';
    els.confirmError.textContent = '';
    els.dialog.showModal();
    requestAnimationFrame(() => els.confirmPassword.focus());
}

async function revokeSessions(user) {
    openConfirmation({
        title: 'Revocă toate sesiunile',
        message: `Toate dispozitivele conectate la contul ${user.username} vor fi delogate.`,
        submitLabel: 'Revocă sesiunile',
        action: async currentPassword => {
            const result = await api(`/api/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`, {
                method: 'POST',
                body: JSON.stringify({ currentPassword })
            });
            setStatus(`${result.revokedSessions} sesiuni au fost revocate.`, 'success');
            await Promise.all([loadUsers(), loadDashboard(), loadAudit()]);
        }
    });
}

function renderUsers(payload) {
    const users = Array.isArray(payload.users) ? payload.users : [];
    if (users.length === 0) {
        els.usersBody.replaceChildren(createEmptyRow(6, 'Nu există utilizatori pentru criteriul selectat.'));
    } else {
        els.usersBody.replaceChildren(...users.map(user => {
            const row = document.createElement('tr');
            row.append(
                createCell(user.username, `${user.email} · ID ${user.id}`),
                createCell(formatDate(user.lastSeenAt), `Creat: ${formatDate(user.createdAt)}`),
                createCell(formatNumber(user.gamesPlayed), `${formatNumber(user.gamesWon)} victorii`),
                createCell(`${formatNumber(user.totalXp)} XP`),
                createCell(formatNumber(user.activeSessions))
            );
            const actionCell = document.createElement('td');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'admin-danger-btn';
            button.textContent = Number(user.id) === Number(state.adminUserId) ? 'Sesiunea ta' : 'Revocă sesiuni';
            button.disabled = Number(user.id) === Number(state.adminUserId);
            button.addEventListener('click', () => revokeSessions(user));
            actionCell.appendChild(button);
            row.appendChild(actionCell);
            return row;
        }));
    }
    els.usersMeta.textContent = `${formatNumber(payload.total)} utilizatori găsiți.`;
}

async function loadUsers() {
    const params = new URLSearchParams({ limit: '50' });
    if (state.userSearch) params.set('search', state.userSearch);
    renderUsers(await api(`/api/admin/users?${params}`));
}

async function closeRoom(room) {
    openConfirmation({
        title: 'Închide camera',
        message: `Camera ${room.roomId} va fi închisă, iar participanții vor primi mesajul de anulare.`,
        submitLabel: 'Închide camera',
        action: async currentPassword => {
            await api(`/api/admin/rooms/${encodeURIComponent(room.roomId)}`, {
                method: 'DELETE',
                body: JSON.stringify({ currentPassword })
            });
            setStatus(`Camera ${room.roomId} a fost închisă.`, 'success');
            await Promise.all([loadRooms(), loadDashboard(), loadAudit()]);
        }
    });
}

function renderRooms(payload) {
    const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    if (rooms.length === 0) {
        els.roomsBody.replaceChildren(createEmptyRow(6, 'Nu există camere Duel active.'));
    } else {
        els.roomsBody.replaceChildren(...rooms.map(room => {
            const settings = room.lobbySettings || {};
            const row = document.createElement('tr');
            row.append(
                createCell(room.roomId),
                createCell(room.hostUsername),
                createCell(`${room.playerCount}/${room.maxPlayers} jucători`, `${room.spectatorCount} spectatori`),
                createCell(room.statusLabel),
                createCell(settings.difficulty || 'easy', settings.timed ? `${settings.timeLimitSeconds}s · BO${room.bestOf}` : `Fără timp · BO${room.bestOf}`)
            );
            const actionCell = document.createElement('td');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'admin-danger-btn';
            button.textContent = 'Închide';
            button.addEventListener('click', () => closeRoom(room));
            actionCell.appendChild(button);
            row.appendChild(actionCell);
            return row;
        }));
    }
    els.roomsMeta.textContent = `${formatNumber(payload.totalRooms)} camere active.`;
}

async function loadRooms() {
    renderRooms(await api('/api/admin/rooms'));
}

function formatAuditDetails(details) {
    if (!details || typeof details !== 'object') return '—';
    return Object.entries(details).map(([key, value]) => `${key}: ${value}`).join(' · ') || '—';
}

function renderAudit(payload) {
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    if (entries.length === 0) {
        els.auditBody.replaceChildren(createEmptyRow(5, 'Nu există încă acțiuni administrative.'));
        return;
    }
    els.auditBody.replaceChildren(...entries.map(entry => {
        const row = document.createElement('tr');
        row.append(
            createCell(formatDate(entry.createdAt)),
            createCell(entry.adminUsername || 'Admin'),
            createCell(entry.action),
            createCell(entry.targetId || '—', entry.targetType || null),
            createCell(formatAuditDetails(entry.details))
        );
        return row;
    }));
}

async function loadAudit() {
    renderAudit(await api('/api/admin/audit?limit=100'));
}

async function loadActiveView() {
    setStatus('Se actualizează datele…');
    try {
        if (state.activeView === 'dashboard') await loadDashboard();
        if (state.activeView === 'users') await loadUsers();
        if (state.activeView === 'rooms') await loadRooms();
        if (state.activeView === 'audit') await loadAudit();
        setStatus('');
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

function selectView(view) {
    if (!viewTitles[view]) return;
    state.activeView = view;
    els.pageTitle.textContent = viewTitles[view];
    document.querySelectorAll('[data-admin-view]').forEach(button => {
        const active = button.dataset.adminView === view;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    document.querySelectorAll('.admin-view').forEach(section => {
        const active = section.id === `adminView${view[0].toUpperCase()}${view.slice(1)}`;
        section.classList.toggle('is-hidden', !active);
        section.setAttribute('aria-hidden', String(!active));
    });
    loadActiveView();
}

async function initialize() {
    try {
        const session = await api('/api/admin/session');
        state.adminUserId = session.user.id;
        els.identity.textContent = `${session.user.username} · ID ${session.user.id}`;
        await loadDashboard();
        setStatus('');
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

document.querySelectorAll('[data-admin-view]').forEach(button => {
    button.addEventListener('click', () => selectView(button.dataset.adminView));
});
els.refresh.addEventListener('click', loadActiveView);
els.userSearchForm.addEventListener('submit', event => {
    event.preventDefault();
    state.userSearch = els.userSearch.value.trim();
    loadUsers().catch(error => setStatus(error.message, 'error'));
});
els.confirmCancel.addEventListener('click', () => {
    state.pendingAction = null;
    els.dialog.close();
});
els.confirmForm.addEventListener('submit', async event => {
    event.preventDefault();
    const action = state.pendingAction;
    if (!action) return els.dialog.close();
    els.confirmSubmit.disabled = true;
    els.confirmCancel.disabled = true;
    els.confirmError.textContent = '';
    try {
        await action(els.confirmPassword.value);
        state.pendingAction = null;
        els.confirmPassword.value = '';
        els.dialog.close();
    } catch (error) {
        els.confirmError.textContent = error.message;
        els.confirmPassword.select();
    } finally {
        els.confirmSubmit.disabled = false;
        els.confirmCancel.disabled = false;
    }
});
els.dialog.addEventListener('close', () => {
    els.confirmPassword.value = '';
    els.confirmError.textContent = '';
});

initialize();
