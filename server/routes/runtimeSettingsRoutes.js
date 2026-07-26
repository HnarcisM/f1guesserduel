'use strict';

const express = require('express');

function createRuntimeSettingsRoutes({ runtimeSettingsService }) {
    const router = express.Router();
    router.get('/runtime-settings', (req, res) => {
        res.set('Cache-Control', 'no-store');
        return res.json(runtimeSettingsService.getPublicSettings());
    });
    return router;
}

module.exports = { createRuntimeSettingsRoutes };
