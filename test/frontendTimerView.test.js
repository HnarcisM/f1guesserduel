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
        }
    };
}

async function createViewWithStoredTimeLimit(timeLimit) {
    global.localStorage = createLocalStorageMock({
        'f1-guesser-timed-mode': 'on',
        'f1-guesser-time-limit': timeLimit
    });

    const { createTimerView } = await import('../public/js/timerView.js');
    return createTimerView({
        getSocket: () => null,
        isRoundFinished: () => false,
        onHostOnlyMessage: () => {}
    });
}

test('timer view normalizes an unsupported stored time limit during initialization', async () => {
    const view = await createViewWithStoredTimeLimit('75');

    assert.equal(view.getSelectedTimeLimitSeconds(), 60);
    assert.deepEqual(view.buildRoundOptions('medium'), {
        level: 'medium',
        timed: true,
        timeLimitSeconds: 60
    });
});

test('timer view preserves a supported stored time limit during initialization', async () => {
    const view = await createViewWithStoredTimeLimit('90');

    assert.equal(view.getSelectedTimeLimitSeconds(), 90);
});
