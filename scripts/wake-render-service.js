#!/usr/bin/env node
'use strict';

const DEFAULT_HEALTH_URL = 'https://f1guesserduel.onrender.com/api/health';
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRY_DELAY_MS = 10_000;
const REQUIRED_HEALTH_CHECKS = Object.freeze(['database', 'drivers', 'rooms']);

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function resolveHealthUrl(env = process.env) {
    const configuredUrl = String(env.RENDER_HEALTH_URL || DEFAULT_HEALTH_URL).trim();
    let url;

    try {
        url = new URL(configuredUrl);
    } catch {
        throw new Error('RENDER_HEALTH_URL trebuie să fie un URL valid.');
    }

    const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
        throw new Error('RENDER_HEALTH_URL trebuie să folosească HTTPS.');
    }

    return url.toString();
}

function validateHealthPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Endpointul health nu a returnat un obiect JSON.');
    }
    if (payload.status !== 'ok') {
        throw new Error(`Serviciul raportează status ${JSON.stringify(payload.status || 'necunoscut')}.`);
    }

    for (const checkName of REQUIRED_HEALTH_CHECKS) {
        const checkStatus = payload.checks?.[checkName]?.status;
        if (checkStatus !== 'ok') {
            throw new Error(`Verificarea ${checkName} lipsește sau nu este ok (${JSON.stringify(checkStatus || 'lipsește')}).`);
        }
    }

    const redisCheck = payload.checks?.redis;
    const redisStatus = redisCheck?.status;
    const roomProvider = payload.checks?.rooms?.provider;

    if (redisCheck && redisStatus !== 'ok') {
        throw new Error(`Verificarea Redis este degradată (${JSON.stringify(redisStatus || 'lipsește')}).`);
    }

    if (roomProvider === 'redis' && redisStatus !== 'ok') {
        throw new Error('Health check inconsistent: rooms folosește Redis, dar checks.redis lipsește sau nu este ok.');
    }

    return payload;
}

async function requestHealth({
    url,
    fetchFn = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS
}) {
    if (typeof fetchFn !== 'function') {
        throw new Error('Runtime-ul Node nu oferă fetch(). Folosește Node.js 22.x.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort(new Error(`Timeout după ${timeoutMs} ms.`));
    }, timeoutMs);
    timeout.unref?.();

    try {
        const response = await fetchFn(url, {
            method: 'GET',
            redirect: 'follow',
            cache: 'no-store',
            headers: {
                accept: 'application/json',
                'cache-control': 'no-cache',
                'user-agent': 'F1GuesserDuel-KeepAlive/1.0'
            },
            signal: controller.signal
        });

        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`Health check HTTP ${response.status}: ${responseText.slice(0, 180)}`);
        }

        let payload;
        try {
            payload = JSON.parse(responseText);
        } catch {
            throw new Error('Health check-ul nu a returnat JSON valid; serviciul poate fi încă în proces de pornire.');
        }

        return validateHealthPayload(payload);
    } finally {
        clearTimeout(timeout);
    }
}

async function wakeRenderService({
    url = resolveHealthUrl(),
    attempts = DEFAULT_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    fetchFn = globalThis.fetch,
    sleep = delay,
    logger = console
} = {}) {
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
        throw new Error('attempts trebuie să fie un număr întreg între 1 și 10.');
    }

    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            logger.log(`[keep-alive] Verificare ${attempt}/${attempts}: ${url}`);
            const payload = await requestHealth({ url, fetchFn, timeoutMs });
            const redisSummary = payload.checks?.redis?.status === 'ok'
                ? 'Redis OK'
                : 'Redis neconfigurat (opțional)';
            logger.log(
                `[keep-alive] Serviciu activ; ${redisSummary}; uptime=${Number(payload.uptimeSeconds || 0)}s.`
            );
            return payload;
        } catch (error) {
            lastError = error;
            logger.warn(`[keep-alive] Încercarea ${attempt} a eșuat: ${error.message}`);
            if (attempt < attempts) await sleep(retryDelayMs);
        }
    }

    throw new Error(`Nu am putut trezi și valida serviciul după ${attempts} încercări: ${lastError?.message || 'eroare necunoscută'}`);
}

async function main() {
    await wakeRenderService();
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[keep-alive] EȘEC: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_ATTEMPTS,
    DEFAULT_HEALTH_URL,
    DEFAULT_RETRY_DELAY_MS,
    DEFAULT_TIMEOUT_MS,
    requestHealth,
    resolveHealthUrl,
    validateHealthPayload,
    wakeRenderService
};
