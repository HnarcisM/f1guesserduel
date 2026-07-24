const DEFAULT_SERVICE_WORKER_URL = '/service-worker.js';
const DEFAULT_SERVICE_WORKER_SCOPE = '/';

export function canRegisterPwaServiceWorker({
    windowObject = globalThis.window,
    navigatorObject = globalThis.navigator
} = {}) {
    if (!windowObject || !navigatorObject?.serviceWorker) return false;
    if (windowObject.isSecureContext !== false) return true;
    const hostname = String(windowObject.location?.hostname || '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function dispatchPwaEvent(windowObject, eventName, detail) {
    if (typeof windowObject?.CustomEvent !== 'function' || typeof windowObject?.dispatchEvent !== 'function') {
        return false;
    }
    windowObject.dispatchEvent(new windowObject.CustomEvent(eventName, { detail }));
    return true;
}

export async function registerPwaServiceWorker({
    windowObject = globalThis.window,
    navigatorObject = globalThis.navigator,
    serviceWorkerUrl = DEFAULT_SERVICE_WORKER_URL,
    scope = DEFAULT_SERVICE_WORKER_SCOPE
} = {}) {
    if (!canRegisterPwaServiceWorker({ windowObject, navigatorObject })) return null;

    try {
        const registration = await navigatorObject.serviceWorker.register(serviceWorkerUrl, {
            scope,
            updateViaCache: 'none'
        });
        dispatchPwaEvent(windowObject, 'f1:pwa-ready', { registration });
        return registration;
    } catch (error) {
        dispatchPwaEvent(windowObject, 'f1:pwa-error', { error });
        return null;
    }
}

export function installPwaController(windowObject = globalThis.window) {
    if (!windowObject?.document) return null;
    if (windowObject.__f1PwaRegistrationPromise) return windowObject.__f1PwaRegistrationPromise;

    const register = () => registerPwaServiceWorker({
        windowObject,
        navigatorObject: windowObject.navigator
    });

    const registrationPromise = windowObject.document.readyState === 'complete'
        ? register()
        : new Promise(resolve => {
            windowObject.addEventListener?.('load', () => resolve(register()), { once: true });
        }).then(result => result);

    windowObject.__f1PwaRegistrationPromise = registrationPromise;
    return registrationPromise;
}

if (typeof window !== 'undefined' && window.document) {
    installPwaController(window);
}
