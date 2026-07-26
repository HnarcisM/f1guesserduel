'use strict';

function normalizeStartPayload(payload) {
    if (typeof payload === 'string') return { variantKey: payload, options: {} };
    if (!payload || typeof payload !== 'object') return null;
    const variantKey = String(payload.variantKey || '').trim().toLowerCase();
    if (!variantKey) return null;
    const sourceOptions = payload.options && typeof payload.options === 'object' ? payload.options : {};
    return {
        variantKey,
        options: {
            difficulty: String(sourceOptions.difficulty || '').trim().toLowerCase() || undefined,
            eraKey: String(sourceOptions.eraKey || '').trim().toLowerCase() || undefined,
            seed: String(sourceOptions.seed || '').trim() || undefined
        }
    };
}

function normalizeGuessId(payload) {
    if (typeof payload === 'string') return payload.trim();
    if (!payload || typeof payload !== 'object') return '';
    return String(payload.id || payload.driverId || payload.entityId || '').trim();
}

function normalizeSudokuPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const cellIndex = Number(payload.cellIndex);
    const driverId = String(payload.driverId || payload.id || '').trim();
    if (!Number.isInteger(cellIndex) || !driverId) return null;
    return { cellIndex, driverId };
}

module.exports = { normalizeGuessId, normalizeStartPayload, normalizeSudokuPayload };
