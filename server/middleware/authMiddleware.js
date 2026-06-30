function createAuthMiddleware(sessionService) {
    return function authMiddleware(req, res, next) {
        const token = req.cookies ? req.cookies[sessionService.cookieName] : null;
        req.user = sessionService.getUserByToken(token);
        next();
    };
}

module.exports = {
    createAuthMiddleware
};
