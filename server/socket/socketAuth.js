function parseCookieHeader(cookieHeader) {
    return String(cookieHeader || '')
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const separatorIndex = part.indexOf('=');
            if (separatorIndex === -1) return cookies;
            const key = decodeURIComponent(part.slice(0, separatorIndex));
            const value = decodeURIComponent(part.slice(separatorIndex + 1));
            cookies[key] = value;
            return cookies;
        }, {});
}

function attachSocketAuth(io, sessionService) {
    io.use(async (socket, next) => {
        try {
            if (!sessionService) return next();

            const cookies = parseCookieHeader(socket.handshake.headers.cookie);
            const token = cookies[sessionService.cookieName];
            socket.user = await sessionService.getUserByToken(token);
            return next();
        } catch (error) {
            return next(error);
        }
    });
}

module.exports = {
    attachSocketAuth,
    parseCookieHeader
};
