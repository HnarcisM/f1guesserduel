function createHealthPayload({ clock = () => new Date(), getUptime = () => process.uptime() } = {}) {
    return {
        status: 'ok',
        uptimeSeconds: Math.floor(getUptime()),
        timestamp: clock().toISOString()
    };
}

function createHealthHandler(options = {}) {
    return (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json(createHealthPayload(options));
    };
}

function createHealthRoutes(options = {}) {
    const express = require('express');
    const router = express.Router();

    router.get('/health', createHealthHandler(options));

    return router;
}

module.exports = {
    createHealthPayload,
    createHealthHandler,
    createHealthRoutes
};
