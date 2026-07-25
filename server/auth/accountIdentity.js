'use strict';

const crypto = require('node:crypto');

const ACCOUNT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeAccountUuid(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ACCOUNT_UUID_PATTERN.test(normalized) ? normalized : null;
}

function generateAccountUuid() {
    return crypto.randomUUID().toLowerCase();
}

module.exports = {
    ACCOUNT_UUID_PATTERN,
    normalizeAccountUuid,
    generateAccountUuid
};
