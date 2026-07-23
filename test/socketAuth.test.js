const test = require('node:test');
const assert = require('node:assert/strict');

const { attachSocketAuth } = require('../server/socket/socketAuth');

test('socket authentication mirrors the user into Socket.IO data for remote fetchSockets', async () => {
    let middleware = null;
    const io = {
        use(handler) {
            middleware = handler;
        }
    };
    const user = { id: 42, username: 'ClusterUser' };
    const sessionService = {
        cookieName: 'f1_session',
        async getUserByToken(token) {
            assert.equal(token, 'session-token');
            return user;
        }
    };
    const socket = {
        handshake: {
            headers: {
                cookie: 'theme=carbon; f1_session=session-token'
            }
        },
        data: {}
    };

    attachSocketAuth(io, sessionService);
    await new Promise((resolve, reject) => {
        middleware(socket, error => error ? reject(error) : resolve());
    });

    assert.equal(socket.user, user);
    assert.equal(socket.data.authUser, user);
});
