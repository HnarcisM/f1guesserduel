const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createServerErrorHandler,
    createServerErrorMessage
} = require('../server/middleware/serverErrorHandler');

test('server error message is friendly for EADDRINUSE', () => {
    const message = createServerErrorMessage({ code: 'EADDRINUSE' }, { port: 3000 });

    assert.match(message, /Portul 3000 este deja folosit/);
    assert.match(message, /netstat -ano \| findstr :3000/);
    assert.match(message, /taskkill \/PID <PID> \/F/);
    assert.match(message, /set PORT=3001/);
});

test('server error message handles EACCES', () => {
    const message = createServerErrorMessage({ code: 'EACCES' }, { port: 80 });

    assert.match(message, /Nu am permisiune/);
    assert.match(message, /portul 80/);
});

test('server error handler logs friendly message and exits with code 1', () => {
    const messages = [];
    let exitCode = null;
    const handler = createServerErrorHandler({
        port: 3000,
        logger: { error: message => messages.push(String(message)) },
        exitProcess: code => { exitCode = code; }
    });

    handler({ code: 'EADDRINUSE' });

    assert.equal(exitCode, 1);
    assert.equal(messages.some(message => message.includes('F1 GUESSER DUEL NU A PUTUT PORNI')), true);
    assert.equal(messages.some(message => message.includes('Portul 3000 este deja folosit')), true);
});
