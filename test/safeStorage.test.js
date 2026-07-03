const test = require('node:test');
const assert = require('node:assert/strict');

function preserveLocalStorage() {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    return () => {
        if (descriptor) {
            Object.defineProperty(globalThis, 'localStorage', descriptor);
        } else {
            delete globalThis.localStorage;
        }
    };
}

test('safeStorage returns fallbacks when localStorage is unavailable', async () => {
    const restoreLocalStorage = preserveLocalStorage();
    delete globalThis.localStorage;

    try {
        const { safeGetItem, safeSetItem, safeRemoveItem } = await import('../public/js/safeStorage.js');

        assert.equal(safeGetItem('missing-key', 'fallback'), 'fallback');
        assert.equal(safeSetItem('missing-key', 'value'), false);
        assert.equal(safeRemoveItem('missing-key'), false);
    } finally {
        restoreLocalStorage();
    }
});

test('safeStorage does not throw when browser storage access is blocked', async () => {
    const restoreLocalStorage = preserveLocalStorage();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
            throw new Error('Storage access is blocked');
        }
    });

    try {
        const { safeGetItem, safeSetItem, safeRemoveItem } = await import('../public/js/safeStorage.js');

        assert.equal(safeGetItem('blocked-key', 'fallback'), 'fallback');
        assert.doesNotThrow(() => safeSetItem('blocked-key', 'value'));
        assert.doesNotThrow(() => safeRemoveItem('blocked-key'));
        assert.equal(safeSetItem('blocked-key', 'value'), false);
        assert.equal(safeRemoveItem('blocked-key'), false);
    } finally {
        restoreLocalStorage();
    }
});

test('frontend stats keep working when localStorage writes fail', async () => {
    const restoreLocalStorage = preserveLocalStorage();
    globalThis.localStorage = {
        getItem() {
            throw new Error('read failed');
        },
        setItem() {
            throw new Error('write failed');
        },
        removeItem() {
            throw new Error('remove failed');
        }
    };

    try {
        const { getStats, updateStats } = await import('../public/js/stats.js');

        assert.doesNotThrow(() => updateStats(true, 3));
        assert.deepEqual(getStats(), {
            played: 0,
            won: 0,
            streak: 0,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
        });
    } finally {
        restoreLocalStorage();
    }
});
