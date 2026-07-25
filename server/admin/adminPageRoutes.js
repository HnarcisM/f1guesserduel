'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const { createAuthMiddleware } = require('../middleware/authMiddleware');

function createAdminPageRoutes({ sessionService, adminAccess, uiDirectoryPath }) {
    const router = express.Router();
    const uiRoot = path.resolve(uiDirectoryPath || path.join(__dirname, 'ui'));

    router.use(cookieParser());
    router.use(createAuthMiddleware(sessionService));
    router.use(adminAccess.requireAdminPage);
    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        next();
    });

    router.get('/', (req, res) => res.sendFile('index.html', { root: uiRoot }));
    router.get('/admin.css', (req, res) => res.sendFile('admin.css', { root: uiRoot }));
    router.get('/admin.js', (req, res) => res.sendFile('admin.js', { root: uiRoot }));

    return router;
}

module.exports = { createAdminPageRoutes };
