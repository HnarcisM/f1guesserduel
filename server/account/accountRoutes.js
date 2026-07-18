const express = require('express');

function createAccountSummaryHandler({ accountStatsService }) {
    return async function accountSummaryHandler(req, res, next) {
        try {
            res.set('Cache-Control', 'no-store');
            if (!req.user) {
                return res.status(401).json({ message: 'Trebuie să fii autentificat pentru a vedea contul.' });
            }

            return res.json({
                user: req.user,
                stats: await accountStatsService.getAccountStats(req.user.id)
            });
        } catch (error) {
            return next(error);
        }
    };
}

function createAccountRoutes({ accountStatsService }) {
    const router = express.Router();

    router.get('/summary', createAccountSummaryHandler({ accountStatsService }));

    return router;
}

module.exports = {
    createAccountRoutes,
    createAccountSummaryHandler
};
