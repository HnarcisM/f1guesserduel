const test = require('node:test');
const assert = require('node:assert/strict');

function createLocalStorageMock(initialValues = {}) {
    const values = new Map(Object.entries(initialValues));

    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        },
        clear() {
            values.clear();
        }
    };
}

test('frontend stats fallback to defaults when localStorage contains invalid JSON', async () => {
    global.localStorage = createLocalStorageMock({
        'f1-guesser-stats': '{broken-json'
    });

    const { getStats } = await import('../public/js/stats.js');
    const stats = getStats();

    assert.deepEqual(stats, {
        played: 0,
        won: 0,
        streak: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    });
    assert.equal(global.localStorage.getItem('f1-guesser-stats'), null);
});

test('frontend stats update recovers after corrupted localStorage state', async () => {
    global.localStorage = createLocalStorageMock({
        'f1-guesser-stats': 'not-json'
    });

    const { getStats, updateStats } = await import('../public/js/stats.js');

    assert.doesNotThrow(() => updateStats(true, 2));
    assert.deepEqual(getStats(), {
        played: 1,
        won: 1,
        streak: 1,
        distribution: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 }
    });
});

test('account stats card uses authoritative totals and aggregates mode distributions', async () => {
    const { normalizeAccountStatsForCard } = await import('../public/js/stats.js');

    const stats = normalizeAccountStatsForCard({
        totals: {
            played: 32,
            won: 20,
            bestStreak: 5
        },
        modes: {
            single: {
                distribution: { 1: 2, 2: 3, 3: 1, 4: 0, 5: 0, 6: 0 }
            },
            daily: {
                distribution: { 1: 1, 2: 0, 3: 2, 4: 1, 5: 0, 6: 0 }
            },
            duel: {
                distribution: { 1: 0, 2: 4, 3: 0, 4: 0, 5: 1, 6: 1 }
            }
        }
    });

    assert.deepEqual(stats, {
        played: 32,
        won: 20,
        streak: 5,
        distribution: { 1: 3, 2: 7, 3: 3, 4: 1, 5: 1, 6: 1 }
    });
});
