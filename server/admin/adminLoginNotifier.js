'use strict';

function normalizeWebhookUrl(value) {
    if (!value) return null;
    try {
        const parsed = new URL(String(value));
        return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function createAdminLoginNotifier({
    isAdminUser = () => false,
    recordAuditEvent = async () => null,
    webhookUrl = null,
    webhookTimeoutMs = 5_000,
    fetchFn = globalThis.fetch,
    logger = console,
    clock = () => new Date()
} = {}) {
    const targetUrl = normalizeWebhookUrl(webhookUrl);

    async function postWebhook(payload) {
        if (!targetUrl || typeof fetchFn !== 'function') return { sent: false, reason: 'disabled' };
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeout = setTimeout(() => controller?.abort?.(), webhookTimeoutMs);
        timeout?.unref?.();
        try {
            const response = await fetchFn(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller?.signal
            });
            if (!response?.ok) throw new Error(`Webhook returned HTTP ${response?.status || 'unknown'}.`);
            return { sent: true };
        } finally {
            clearTimeout(timeout);
        }
    }

    async function notify({ user, request = null, authorizationMode = null } = {}) {
        if (!isAdminUser(user)) return { notified: false, reason: 'not-admin' };
        const occurredAt = clock().toISOString();
        const ip = String(request?.ip || request?.socket?.remoteAddress || '').slice(0, 100) || null;
        const userAgent = String(request?.get?.('user-agent') || request?.headers?.['user-agent'] || '')
            .slice(0, 300) || null;
        const details = { ip, userAgent, authorizationMode, occurredAt, webhookConfigured: Boolean(targetUrl) };
        const auditEntry = {
            adminUserId: user.id,
            action: 'admin.login.succeeded',
            targetType: 'admin-session',
            targetId: String(user.accountUuid || user.id),
            details,
            requestId: request?.requestId || null
        };
        const webhookPayload = {
            event: 'admin.login.succeeded',
            occurredAt,
            admin: {
                id: user.id,
                accountUuid: user.accountUuid || null,
                username: user.username
            },
            context: { ip, userAgent, authorizationMode }
        };

        logger?.warn?.('Administrator login detected.', {
            adminUserId: user.id,
            adminUsername: user.username,
            ip,
            authorizationMode
        });

        const auditPromise = Promise.resolve()
            .then(() => recordAuditEvent(auditEntry))
            .then(() => ({ recorded: true }))
            .catch(error => {
                logger?.error?.('Admin login audit failed.', { error, adminUserId: user.id });
                return { recorded: false, reason: 'error' };
            });
        const webhookPromise = postWebhook(webhookPayload).catch(error => {
            logger?.error?.('Admin login webhook failed.', { error, adminUserId: user.id });
            return { sent: false, reason: 'error' };
        });
        const [audit, webhook] = await Promise.all([auditPromise, webhookPromise]);
        return { notified: true, audit, webhook };
    }

    return {
        enabled: Boolean(targetUrl),
        notify
    };
}

module.exports = {
    createAdminLoginNotifier,
    normalizeWebhookUrl
};
