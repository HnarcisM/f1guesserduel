const assert = require('node:assert/strict');
const test = require('node:test');

const { createAccountSummaryHandler } = require('../server/account/accountRoutes');

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test('account summary requires authentication and disables caching', async () => {
    const handler = createAccountSummaryHandler({
        accountStatsService: { async getAccountStats() { throw new Error('must not run'); } }
    });
    const response = createResponse();

    await handler({ user: null }, response, error => { throw error; });

    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.match(response.body.message, /autentificat/);
});

test('account summary returns only the authenticated user statistics', async () => {
    const requestedUserIds = [];
    const stats = { totals: { played: 3 }, modes: {} };
    const recentGames = [{ mode: 'single', outcome: 'win', attempts: 2 }];
    const handler = createAccountSummaryHandler({
        accountStatsService: {
            async getAccountDashboard(userId) {
                requestedUserIds.push(userId);
                return { stats, recentGames };
            }
        }
    });
    const user = { id: 7, username: 'Narcis', email: 'n@example.com' };
    const response = createResponse();

    await handler({ user, query: { userId: 999 } }, response, error => { throw error; });

    assert.deepEqual(requestedUserIds, [7]);
    assert.deepEqual(response.body, { user, stats, recentGames });
    assert.equal(response.headers['Cache-Control'], 'no-store');
});
