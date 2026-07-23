const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('Socket bridge exposes the game socket after the main Socket.IO factory runs', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'socketBridgeBootstrap.js'),
        'utf8'
    );
    const socket = { id: 'socket-ready' };
    const events = [];
    function ioFactory(...args) {
        ioFactory.lastArgs = args;
        return socket;
    }
    ioFactory.Manager = function Manager() {};

    class CustomEventStub {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    }

    const windowObject = {
        io: ioFactory,
        CustomEvent: CustomEventStub,
        dispatchEvent(event) {
            events.push(event);
        },
        queueMicrotask(callback) {
            callback();
        }
    };

    vm.runInNewContext(source, { window: windowObject, Promise, Object });
    const resolvedSocket = windowObject.io('/game', { transports: ['websocket'] });

    assert.equal(resolvedSocket, socket);
    assert.equal(windowObject.__f1GameSocket, socket);
    assert.deepEqual(Array.from(ioFactory.lastArgs), ['/game', { transports: ['websocket'] }]);
    assert.equal(windowObject.io.Manager, ioFactory.Manager);
    assert.equal(windowObject.io.__f1SocketBridge, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'f1:socket-created');
    assert.equal(events[0].detail.socket, socket);
});
