function createAuthMiddleware(sessionService) {
    return async function authMiddleware(req, res, next) {
        try {
            const token = req.cookies ? req.cookies[sessionService.cookieName] : null;
            req.user = await sessionService.getUserByToken(token);
            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = {
    createAuthMiddleware
};
