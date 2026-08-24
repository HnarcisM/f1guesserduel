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
    assert.match(server, /require\('\.\/email\/emailProviderConfig'\)/);
    assert.match(server, /require\('\.\/email\/resendEmailTransport'\)/);
    assert.match(server, /require\('\.\/email\/passwordResetEmailNotifier'\)/);
    assert.match(
        server,
        /const emailConfig = createEmailProviderConfig\(process\.env, \{[\s\S]*?isProduction: config\.isProduction[\s\S]*?\}\);/
    );
    assert.match(
        server,
        /const emailTransport = emailConfig\.provider === 'resend'[\s\S]*?createResendEmailTransport\(\{ apiKey: emailConfig\.resend\.apiKey \}\)[\s\S]*?: null;/
    );
    assert.match(
        server,
        /const emailDeliveryService = createEmailDeliveryService\(\{[\s\S]*?transport: emailTransport,[\s\S]*?defaultFrom: emailConfig\.from,[\s\S]*?timeoutMs: emailConfig\.timeoutMs[\s\S]*?\}\);/
    );
    assert.match(
        server,
        /const passwordResetEmailNotifier = createPasswordResetEmailNotifier\(\{[\s\S]*?emailDeliveryService,[\s\S]*?publicOrigin: emailConfig\.publicOrigin,[\s\S]*?requireHttps: config\.isProduction[\s\S]*?\}\);/
    );
    assert.match(
        server,
        /onPasswordResetRequested: delivery => passwordResetEmailNotifier\.notify\(delivery\)/
    );
    assert.doesNotMatch(server, /nodemailer|sendgrid|smtp/i);
});
