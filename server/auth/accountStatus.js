'use strict';

const ACCOUNT_STATUS_ACTIVE = 'active';
const ACCOUNT_STATUS_SUSPENDED = 'suspended';

function normalizeAccountStatus(value) {
    return value === ACCOUNT_STATUS_SUSPENDED
        ? ACCOUNT_STATUS_SUSPENDED
        : ACCOUNT_STATUS_ACTIVE;
}

function normalizeSuspendedUntil(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isAccountSuspended(user, now = Date.now()) {
    if (normalizeAccountStatus(user?.accountStatus || user?.account_status) !== ACCOUNT_STATUS_SUSPENDED) {
        return false;
    }
    const suspendedUntil = normalizeSuspendedUntil(user?.suspendedUntil || user?.suspended_until);
    return !suspendedUntil || new Date(suspendedUntil).getTime() > Number(now);
}

function buildSuspensionMessage(user) {
    const suspendedUntil = normalizeSuspendedUntil(user?.suspendedUntil || user?.suspended_until);
    if (!suspendedUntil) {
        return 'Contul este suspendat. Contactează administratorul pentru mai multe informații.';
    }
    const formatted = new Intl.DateTimeFormat('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Bucharest'
    }).format(new Date(suspendedUntil));
    return `Contul este suspendat până la ${formatted}.`;
}

module.exports = {
    ACCOUNT_STATUS_ACTIVE,
    ACCOUNT_STATUS_SUSPENDED,
    normalizeAccountStatus,
    normalizeSuspendedUntil,
    isAccountSuspended,
    buildSuspensionMessage
};
