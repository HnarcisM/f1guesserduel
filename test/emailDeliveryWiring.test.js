'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('server wires password-reset requests through the provider-agnostic email abstraction', () => {
    const server = read('server/index.js');

    assert.match(server, /require\('\.\/email\/emailDeliveryService'\)/);
    assert.match(server, /require\('\.\/email\/passwordResetEmailNotifier'\)/);
    assert.match(server, /const emailDeliveryService = createEmailDeliveryService\(\);/);
    assert.match(
        server,
        /const passwordResetEmailNotifier = createPasswordResetEmailNotifier\(\{[\s\S]*?emailDeliveryService,[\s\S]*?requireHttps: config\.isProduction[\s\S]*?\}\);/
    );
    assert.match(
        server,
        /onPasswordResetRequested: delivery => passwordResetEmailNotifier\.notify\(delivery\)/
    );
    assert.doesNotMatch(server, /nodemailer|sendgrid|resend|smtp/i);
});
