'use strict';

const state = { activeView: 'dashboard', adminUserId: null, adminAuthorizationMode: 'disabled', userSearch: '', pendingAction: null, selectedUser: null, operationalSettings: null };
const $ = id => document.getElementById(id);
const els = {
    pageTitle: $('adminPageTitle'), refresh: $('adminRefreshBtn'), status: $('adminStatus'), identity: $('adminIdentity'),
    metricGrid: $('adminMetricGrid'), activityTrend: $('adminActivityTrend'), systemSummary: $('adminSystemSummary'),
    usersBody: $('adminUsersBody'), usersMeta: $('adminUsersMeta'), userSearchForm: $('adminUserSearchForm'), userSearch: $('adminUserSearch'),
    roomsBody: $('adminRoomsBody'), roomsMeta: $('adminRoomsMeta'), auditBody: $('adminAuditBody'), auditMeta: $('adminAuditMeta'),
    auditFilterForm: $('adminAuditFilterForm'), auditSearch: $('adminAuditSearch'), auditAction: $('adminAuditAction'),
    auditExportJson: $('adminAuditExportJson'), auditExportCsv: $('adminAuditExportCsv'),
    operationsSave: $('adminOperationsSave'), operationsMeta: $('adminOperationsMeta'), modeToggles: $('adminModeToggles'), serviceStatus: $('adminServiceStatus'),
    maintenanceEnabled: $('adminMaintenanceEnabled'), maintenanceMessage: $('adminMaintenanceMessage'), announcementEnabled: $('adminAnnouncementEnabled'), announcementLevel: $('adminAnnouncementLevel'), announcementMessage: $('adminAnnouncementMessage'),
    analyticsBody: $('adminAnalyticsBody'), analyticsMeta: $('adminAnalyticsMeta'),
    confirmDialog: $('adminConfirmDialog'), confirmForm: $('adminConfirmForm'), confirmTitle: $('adminConfirmTitle'), confirmMessage: $('adminConfirmMessage'), confirmPassword: $('adminConfirmPassword'), confirmError: $('adminConfirmError'), confirmCancel: $('adminConfirmCancel'), confirmSubmit: $('adminConfirmSubmit'),
    userDialog: $('adminUserDialog'), userDialogTitle: $('adminUserDialogTitle'), userDialogClose: $('adminUserDialogClose'), userDetails: $('adminUserDetails'), userActions: $('adminUserActions'),
    suspendDialog: $('adminSuspendDialog'), suspendForm: $('adminSuspendForm'), suspendTarget: $('adminSuspendTarget'), suspendDuration: $('adminSuspendDuration'), suspendReason: $('adminSuspendReason'), suspendPassword: $('adminSuspendPassword'), suspendError: $('adminSuspendError'), suspendCancel: $('adminSuspendCancel'), suspendSubmit: $('adminSuspendSubmit')
};
const viewTitles = { dashboard: 'Dashboard', users: 'Utilizatori', rooms: 'Camere active', operations: 'Operațional', analytics: 'Statistici', audit: 'Audit' };

async function api(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Cererea administrativă a eșuat.');
    return payload;
}
function setStatus(message = '', type = '') { els.status.textContent = message; els.status.className = `admin-status${type ? ` is-${type}` : ''}`; }
function formatNumber(value) { return new Intl.NumberFormat('ro-RO').format(Number(value) || 0); }
function formatDate(value) { return value ? new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function formatDuration(value) { const seconds = Math.max(0, Math.round((Number(value) || 0) / 1000)); const minutes = Math.floor(seconds / 60); return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`; }
function createCell(primary, secondary = null) { const td = document.createElement('td'); const strong = document.createElement('strong'); strong.textContent = primary ?? '—'; td.appendChild(strong); if (secondary) { const small = document.createElement('small'); small.textContent = secondary; td.appendChild(small); } return td; }
function createEmptyRow(columns, message) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = columns; cell.className = 'admin-empty-row'; cell.textContent = message; row.appendChild(cell); return row; }
function button(label, className, handler, disabled = false) { const el = document.createElement('button'); el.type = 'button'; el.className = className; el.textContent = label; el.disabled = disabled; el.addEventListener('click', handler); return el; }

function renderMetrics(data) {
    const metrics = [['Utilizatori', data.totalUsers], ['Activi 24h', data.activeUsers24h], ['Suspendați', data.suspendedUsers], ['Sesiuni active', data.activeSessions], ['Socket-uri', data.connectedSockets], ['Camere', data.activeRooms], ['Jocuri 24h', data.gamesLast24h], ['Daily astăzi', data.dailyAttemptsToday], ['Weekly curent', data.weeklyAttemptsCurrent]];
    els.metricGrid.replaceChildren(...metrics.map(([label, value]) => { const card = document.createElement('article'); card.className = 'admin-metric'; const span = document.createElement('span'); span.textContent = label; const strong = document.createElement('strong'); strong.textContent = formatNumber(value); card.append(span, strong); return card; }));
    const trend = Array.isArray(data.activityTrend) ? data.activityTrend : [];
    const max = Math.max(1, ...trend.map(day => Number(day.gamesCompleted) || 0));
    els.activityTrend.replaceChildren(...trend.map(day => { const item = document.createElement('article'); item.className = 'admin-trend-day'; const bar = document.createElement('div'); bar.className = 'admin-trend-bar'; bar.style.setProperty('--trend-height', `${Math.max(5, Math.round(((Number(day.gamesCompleted) || 0) / max) * 100))}%`); const label = document.createElement('strong'); label.textContent = day.date.slice(5); const details = document.createElement('small'); details.textContent = `${formatNumber(day.gamesCompleted)} jocuri · ${formatNumber(day.usersCreated)} conturi`; item.append(bar, label, details); return item; }));
    const summary = [['Ultima actualizare', formatDate(data.generatedAt)], ['Daily curent', data.dailyDate], ['Weekly curent', data.weekKey], ['Acces', state.adminAuthorizationMode === 'account-uuid' ? 'UUID permanent + verificare server-side' : 'ID numeric legacy · migrare necesară'], ['Acțiuni sensibile', 'Parolă + audit']];
    els.systemSummary.replaceChildren(...summary.map(([term, description]) => { const wrap = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = term; dd.textContent = description; wrap.append(dt, dd); return wrap; }));
}
async function loadDashboard() { renderMetrics(await api('/api/admin/overview')); }

function openConfirmation({ title, message, submitLabel, action }) { state.pendingAction = action; els.confirmTitle.textContent = title; els.confirmMessage.textContent = message; els.confirmSubmit.textContent = submitLabel; els.confirmPassword.value = ''; els.confirmError.textContent = ''; els.confirmDialog.showModal(); }
async function confirmedRequest(config) { openConfirmation(config); }

function statusLabel(user) { return user.effectiveStatus === 'suspended' ? `Suspendat${user.suspendedUntil ? ` până la ${formatDate(user.suspendedUntil)}` : ' permanent'}` : 'Activ'; }
function renderUsers(payload) {
    const users = Array.isArray(payload.users) ? payload.users : [];
    els.usersBody.replaceChildren(...(users.length ? users.map(user => { const row = document.createElement('tr'); row.append(createCell(user.username, `${user.email} · ID ${user.id}`), createCell(statusLabel(user), user.suspensionReason || null), createCell(formatDate(user.lastSeenAt), `Creat: ${formatDate(user.createdAt)}`), createCell(formatNumber(user.gamesPlayed), `${formatNumber(user.gamesWon)} victorii`), createCell(`${formatNumber(user.totalXp)} XP`), createCell(formatNumber(user.activeSessions))); const actions = document.createElement('td'); actions.className = 'admin-inline-actions'; actions.append(button('Detalii', 'admin-secondary-btn', () => openUser(user.id)), button('Revocă sesiuni', 'admin-danger-btn', () => revokeSessions(user), Number(user.id) === Number(state.adminUserId))); row.append(actions); return row; }) : [createEmptyRow(7, 'Nu există utilizatori pentru criteriul selectat.')]));
    els.usersMeta.textContent = `${formatNumber(payload.total)} utilizatori găsiți.`;
}
async function loadUsers() { const params = new URLSearchParams({ limit: '50' }); if (state.userSearch) params.set('search', state.userSearch); renderUsers(await api(`/api/admin/users?${params}`)); }
async function revokeSessions(user) { confirmedRequest({ title: 'Revocă toate sesiunile', message: `Contul ${user.username} va fi delogat de pe toate dispozitivele.`, submitLabel: 'Revocă', action: async currentPassword => { const result = await api(`/api/admin/users/${user.id}/revoke-sessions`, { method: 'POST', body: JSON.stringify({ currentPassword }) }); setStatus(`${result.revokedSessions} sesiuni revocate.`, 'success'); await Promise.all([loadUsers(), loadDashboard(), loadAudit()]); } }); }

function appendSection(title, rows) { const section = document.createElement('section'); section.className = 'admin-detail-section'; const heading = document.createElement('h3'); heading.textContent = title; section.appendChild(heading); for (const [key, value] of rows) { const row = document.createElement('div'); const label = document.createElement('span'); const content = document.createElement('strong'); label.textContent = key; content.textContent = value ?? '—'; row.append(label, content); section.appendChild(row); } return section; }
function renderUserDetails(payload) {
    const user = payload.user; state.selectedUser = user; els.userDialogTitle.textContent = `${user.username} · ID ${user.id}`; els.userDetails.replaceChildren(
        appendSection('Cont', [['Email', user.email], ['Status', statusLabel(user)], ['Motiv', user.suspensionReason || '—'], ['Creat', formatDate(user.createdAt)], ['Ultima activitate', formatDate(user.lastSeenAt)], ['XP', `${formatNumber(user.totalXp)} XP`], ['Sesiuni', formatNumber(user.activeSessions)]]),
        appendSection('Statistici', (payload.stats || []).map(stat => [stat.mode, `${formatNumber(stat.gamesPlayed)} jocuri · ${formatNumber(stat.gamesWon)} victorii · streak ${formatNumber(stat.bestStreak)}`])),
        appendSection('Rezultate recente', (payload.recentResults || []).slice(0, 8).map(result => [formatDate(result.completedAt), `${result.mode} · ${result.outcome} · ${result.attempts} încercări`])),
        appendSection('Challenge-uri', [['Daily curent', (payload.dailyAttempts || []).some(item => item.dailyDate === payload.challengeKeys.dailyDate) ? 'Folosit' : 'Disponibil'], ['Weekly curent', (payload.weeklyAttempts || []).some(item => item.weekKey === payload.challengeKeys.weekKey) ? 'Folosit' : 'Disponibil']]),
        appendSection('Istoric suspendări', (payload.suspensionHistory || []).length
            ? payload.suspensionHistory.map(entry => [
                formatDate(entry.createdAt),
                entry.eventType === 'suspended'
                    ? `Suspendat de ${entry.adminUsername || 'Admin'} · ${entry.duration || 'permanent'} · ${entry.reason || 'fără motiv'}`
                    : `Reactivat de ${entry.adminUsername || 'Admin'}`
            ])
            : [['Istoric', 'Nu există suspendări înregistrate.']])
    );
    els.userActions.replaceChildren();
    if (Number(user.id) !== Number(state.adminUserId)) {
        if (user.effectiveStatus === 'suspended') els.userActions.append(button('Reactivează', 'admin-primary-btn', () => reactivateUser(user)));
        else els.userActions.append(button('Suspendă', 'admin-danger-btn', () => openSuspend(user)));
        els.userActions.append(button('Reset Daily curent', 'admin-secondary-btn', () => resetChallenge(user, 'daily')), button('Reset Weekly curent', 'admin-secondary-btn', () => resetChallenge(user, 'weekly')));
    }
}
async function openUser(userId) { setStatus('Se încarcă utilizatorul…'); try { renderUserDetails(await api(`/api/admin/users/${userId}`)); els.userDialog.showModal(); setStatus(''); } catch (error) { setStatus(error.message, 'error'); } }
function openSuspend(user) { state.selectedUser = user; els.suspendTarget.textContent = `${user.username} · ID ${user.id}`; els.suspendReason.value = ''; els.suspendPassword.value = ''; els.suspendError.textContent = ''; els.suspendDialog.showModal(); }
async function reactivateUser(user) { confirmedRequest({ title: 'Reactivează contul', message: `Contul ${user.username} va putea să se autentifice din nou.`, submitLabel: 'Reactivează', action: async currentPassword => { await api(`/api/admin/users/${user.id}/reactivate`, { method: 'POST', body: JSON.stringify({ currentPassword }) }); els.userDialog.close(); setStatus('Cont reactivat.', 'success'); await Promise.all([loadUsers(), loadDashboard(), loadAudit()]); } }); }
async function resetChallenge(user, mode) { const label = mode === 'daily' ? 'Daily' : 'Weekly'; confirmedRequest({ title: `Reset ${label}`, message: `Încercarea curentă ${label} pentru ${user.username} va fi disponibilă din nou. Istoricul și XP-ul nu sunt șterse.`, submitLabel: 'Resetează', action: async currentPassword => { const result = await api(`/api/admin/users/${user.id}/reset-${mode}`, { method: 'POST', body: JSON.stringify({ currentPassword }) }); els.userDialog.close(); setStatus(`${label} resetat (${result.deletedAttempts} înregistrări).`, 'success'); await Promise.all([loadUsers(), loadDashboard(), loadAudit()]); } }); }

function renderRooms(payload) { const rooms = Array.isArray(payload.rooms) ? payload.rooms : []; els.roomsBody.replaceChildren(...(rooms.length ? rooms.map(room => { const settings = room.lobbySettings || {}; const row = document.createElement('tr'); row.append(createCell(room.roomId), createCell(room.hostUsername), createCell(`${room.playerCount}/${room.maxPlayers} jucători`, `${room.spectatorCount} spectatori`), createCell(room.statusLabel), createCell(settings.difficulty || 'easy', settings.timed ? `${settings.timeLimitSeconds}s · BO${room.bestOf}` : `Fără timp · BO${room.bestOf}`)); const cell = document.createElement('td'); cell.append(button('Închide', 'admin-danger-btn', () => closeRoom(room))); row.append(cell); return row; }) : [createEmptyRow(6, 'Nu există camere Duel active.')])); els.roomsMeta.textContent = `${formatNumber(payload.totalRooms)} camere active.`; }
async function loadRooms() { renderRooms(await api('/api/admin/rooms')); }
async function closeRoom(room) { confirmedRequest({ title: 'Închide camera', message: `Camera ${room.roomId} va fi închisă.`, submitLabel: 'Închide', action: async currentPassword => { await api(`/api/admin/rooms/${room.roomId}`, { method: 'DELETE', body: JSON.stringify({ currentPassword }) }); setStatus('Camera a fost închisă.', 'success'); await Promise.all([loadRooms(), loadDashboard(), loadAudit()]); } }); }

function renderOperationalSettings(payload) {
    const settings = payload.settings || {};
    state.operationalSettings = settings;
    els.maintenanceEnabled.checked = settings.maintenance?.enabled === true;
    els.maintenanceMessage.value = settings.maintenance?.message || '';
    els.announcementEnabled.checked = settings.announcement?.enabled === true;
    els.announcementLevel.value = settings.announcement?.level || 'info';
    els.announcementMessage.value = settings.announcement?.message || '';
    const definitions = Array.isArray(payload.modeDefinitions) ? payload.modeDefinitions : [];
    els.modeToggles.replaceChildren(...definitions.map(definition => {
        const label = document.createElement('label'); label.className = 'admin-mode-toggle';
        const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.modeKey = definition.key; input.checked = settings.modes?.[definition.key] !== false;
        const text = document.createElement('span'); text.textContent = definition.label;
        label.append(input, text); return label;
    }));
    els.operationsMeta.textContent = `Actualizat: ${formatDate(payload.updatedAt)} · notificare login admin: ${payload.adminLoginNotifications?.webhookEnabled ? 'webhook activ' : 'doar audit + log server'}.`;
}
function collectOperationalSettings() {
    return {
        maintenance: { enabled: els.maintenanceEnabled.checked, message: els.maintenanceMessage.value.trim() },
        announcement: { enabled: els.announcementEnabled.checked, level: els.announcementLevel.value, message: els.announcementMessage.value.trim() },
        modes: Object.fromEntries(Array.from(els.modeToggles.querySelectorAll('[data-mode-key]')).map(input => [input.dataset.modeKey, input.checked]))
    };
}
function renderServiceStatus(payload) {
    const services = Array.isArray(payload.services) ? payload.services : [];
    els.serviceStatus.replaceChildren(...services.map(service => {
        const card = document.createElement('article'); card.className = 'admin-service-card'; card.dataset.status = service.status;
        const label = document.createElement('span'); label.textContent = service.name;
        const status = document.createElement('strong'); status.textContent = service.status === 'ok' ? 'Disponibil' : (service.status === 'disabled' ? 'Dezactivat' : 'Eroare');
        const details = document.createElement('small'); details.textContent = `${service.provider}${service.latencyMs === null ? '' : ` · ${service.latencyMs} ms`}`;
        card.append(label, status, details); return card;
    }));
}
async function loadOperations() {
    const [settings, status] = await Promise.all([api('/api/admin/operations/settings'), api('/api/admin/system/status')]);
    renderOperationalSettings(settings); renderServiceStatus(status);
}
function saveOperationalSettings() {
    const settings = collectOperationalSettings();
    confirmedRequest({
        title: 'Salvează setările operaționale',
        message: 'Modificările pot bloca jocurile active și vor fi afișate tuturor utilizatorilor.',
        submitLabel: 'Salvează',
        action: async currentPassword => {
            const result = await api('/api/admin/operations/settings', { method: 'PUT', body: JSON.stringify({ currentPassword, settings }) });
            renderOperationalSettings(result); setStatus('Setările operaționale au fost actualizate.', 'success'); await loadAudit();
        }
    });
}
function renderAnalytics(payload) {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    els.analyticsBody.replaceChildren(...(rows.length ? rows.map(item => {
        const row = document.createElement('tr');
        row.append(createCell(item.mode), createCell(item.difficulty), createCell(formatNumber(item.gamesPlayed)), createCell(formatNumber(item.uniquePlayers)), createCell(formatNumber(item.wins)), createCell(formatNumber(item.draws)), createCell(formatNumber(item.losses)), createCell(String(item.averageAttempts)), createCell(formatDuration(item.averageDurationMs)));
        return row;
    }) : [createEmptyRow(9, 'Nu există încă rezultate înregistrate.')]))
    els.analyticsMeta.textContent = `${formatNumber(rows.reduce((sum, item) => sum + (Number(item.gamesPlayed) || 0), 0))} jocuri analizate · actualizat ${formatDate(payload.generatedAt)}.`;
}
async function loadAnalytics() { renderAnalytics(await api('/api/admin/analytics/modes')); }

function formatAuditDetails(details) { return details && typeof details === 'object' ? Object.entries(details).map(([key, value]) => `${key}: ${value}`).join(' · ') || '—' : '—'; }
function renderAudit(payload) { const entries = Array.isArray(payload.entries) ? payload.entries : []; els.auditBody.replaceChildren(...(entries.length ? entries.map(entry => { const row = document.createElement('tr'); row.append(createCell(formatDate(entry.createdAt)), createCell(entry.adminUsername || 'Admin'), createCell(entry.action), createCell(entry.targetId || '—', entry.targetType || null), createCell(formatAuditDetails(entry.details))); return row; }) : [createEmptyRow(5, 'Nu există acțiuni pentru filtrul selectat.')])); els.auditMeta.textContent = `${formatNumber(payload.total)} înregistrări · retenție ${formatNumber(payload.retentionDays)} zile · ${formatNumber(payload.cleanupBatchSize)} rânduri/batch.`; }
function buildAuditParams({ includeLimit = true, format = null } = {}) { const params = new URLSearchParams(); if (includeLimit) params.set('limit', '100'); if (els.auditSearch.value.trim()) params.set('search', els.auditSearch.value.trim()); if (els.auditAction.value) params.set('action', els.auditAction.value); if (format) params.set('format', format); return params; }
async function loadAudit() { renderAudit(await api(`/api/admin/audit?${buildAuditParams()}`)); }
function getDownloadFilename(response, fallback) { const disposition = response.headers.get('content-disposition') || ''; const match = disposition.match(/filename="?([^";]+)"?/i); return match?.[1] || fallback; }
async function downloadAudit(format) { const buttons = [els.auditExportJson, els.auditExportCsv]; buttons.forEach(item => { item.disabled = true; }); setStatus(`Se pregătește exportul ${format.toUpperCase()}…`); try { const response = await fetch(`/api/admin/audit/export?${buildAuditParams({ includeLimit: false, format })}`, { credentials: 'same-origin' }); if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || 'Exportul auditului a eșuat.'); } const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = getDownloadFilename(response, `admin-audit.${format}`); document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); setStatus(`Export ${format.toUpperCase()} generat.`, 'success'); } catch (error) { setStatus(error.message, 'error'); } finally { buttons.forEach(item => { item.disabled = false; }); } }

async function loadActiveView() { setStatus('Se actualizează datele…'); try { if (state.activeView === 'dashboard') await loadDashboard(); if (state.activeView === 'users') await loadUsers(); if (state.activeView === 'rooms') await loadRooms(); if (state.activeView === 'operations') await loadOperations(); if (state.activeView === 'analytics') await loadAnalytics(); if (state.activeView === 'audit') await loadAudit(); setStatus(''); } catch (error) { setStatus(error.message, 'error'); } }
function selectView(view) { if (!viewTitles[view]) return; state.activeView = view; els.pageTitle.textContent = viewTitles[view]; document.querySelectorAll('[data-admin-view]').forEach(el => { const active = el.dataset.adminView === view; el.classList.toggle('is-active', active); el.setAttribute('aria-current', active ? 'page' : 'false'); }); document.querySelectorAll('.admin-view').forEach(section => { const active = section.id === `adminView${view[0].toUpperCase()}${view.slice(1)}`; section.classList.toggle('is-hidden', !active); section.setAttribute('aria-hidden', String(!active)); }); loadActiveView(); }

els.refresh.addEventListener('click', loadActiveView);
document.querySelectorAll('[data-admin-view]').forEach(el => el.addEventListener('click', () => selectView(el.dataset.adminView)));
els.userSearchForm.addEventListener('submit', event => { event.preventDefault(); state.userSearch = els.userSearch.value.trim(); loadUsers().catch(error => setStatus(error.message, 'error')); });
els.auditFilterForm.addEventListener('submit', event => { event.preventDefault(); loadAudit().catch(error => setStatus(error.message, 'error')); });
els.auditExportJson.addEventListener('click', () => downloadAudit('json'));
els.auditExportCsv.addEventListener('click', () => downloadAudit('csv'));
els.operationsSave.addEventListener('click', saveOperationalSettings);
els.confirmCancel.addEventListener('click', () => els.confirmDialog.close());
els.confirmDialog.addEventListener('close', () => { state.pendingAction = null; els.confirmPassword.value = ''; els.confirmError.textContent = ''; });
els.confirmForm.addEventListener('submit', async event => { event.preventDefault(); if (!state.pendingAction) return; els.confirmSubmit.disabled = true; try { await state.pendingAction(els.confirmPassword.value); state.pendingAction = null; els.confirmDialog.close(); } catch (error) { els.confirmError.textContent = error.message; } finally { els.confirmSubmit.disabled = false; } });
els.userDialogClose.addEventListener('click', () => els.userDialog.close());
els.userDialog.addEventListener('close', () => { state.selectedUser = null; els.userDetails.replaceChildren(); els.userActions.replaceChildren(); });
els.suspendCancel.addEventListener('click', () => els.suspendDialog.close());
els.suspendDialog.addEventListener('close', () => { els.suspendPassword.value = ''; els.suspendReason.value = ''; els.suspendError.textContent = ''; });
els.suspendForm.addEventListener('submit', async event => { event.preventDefault(); const user = state.selectedUser; if (!user) return; els.suspendSubmit.disabled = true; els.suspendCancel.disabled = true; try { await api(`/api/admin/users/${user.id}/suspend`, { method: 'POST', body: JSON.stringify({ duration: els.suspendDuration.value, reason: els.suspendReason.value, currentPassword: els.suspendPassword.value }) }); els.suspendDialog.close(); els.userDialog.close(); setStatus('Cont suspendat și sesiuni revocate.', 'success'); await Promise.all([loadUsers(), loadDashboard(), loadAudit()]); } catch (error) { els.suspendError.textContent = error.message; els.suspendPassword.select(); } finally { els.suspendSubmit.disabled = false; els.suspendCancel.disabled = false; } });

(async function initialize() {
    try {
        const session = await api('/api/admin/session');
        state.adminUserId = session.user.id;
        state.adminAuthorizationMode = session.authorization?.mode || 'disabled';
        const shortIdentity = session.user.accountUuid ? session.user.accountUuid.slice(0, 8) : `ID ${session.user.id}`;
        els.identity.textContent = `${session.user.username} · ${shortIdentity}`;
        await loadDashboard();
        if (session.authorization?.legacyMigrationRequired) {
            setStatus('Accesul admin folosește încă ID-ul numeric. Copiază accountUuid din /api/admin/session și configurează ADMIN_ACCOUNT_UUIDS.', 'warning');
        }
    } catch (error) {
        setStatus(error.message, 'error');
    }
})();
