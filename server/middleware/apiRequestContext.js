const express = require('express');
const cookieParser = require('cookie-parser');

const { createAuthMiddleware } = require('./authMiddleware');

function createApiRequestContextMiddleware(sessionService) {
    const router = express.Router();

    router.use(express.json({ limit: '32kb' }));
    router.use(cookieParser());
    router.use(createAuthMiddleware(sessionService));

    return router;
}

module.exports = {
    createApiRequestContextMiddleware
};
