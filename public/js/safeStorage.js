function getLocalStorage() {
	try {
		return globalThis?.localStorage || null;
	} catch (error) {
		return null;
	}
}

export function safeGetItem(key, fallbackValue = null) {
	try {
		const storage = getLocalStorage();
		if (!storage || typeof storage.getItem !== 'function') return fallbackValue;

		const value = storage.getItem(key);
		return value === null ? fallbackValue : value;
	} catch (error) {
		return fallbackValue;
	}
}

export function safeSetItem(key, value) {
	try {
		const storage = getLocalStorage();
		if (!storage || typeof storage.setItem !== 'function') return false;

		storage.setItem(key, value);
		return true;
	} catch (error) {
		return false;
	}
}

export function safeRemoveItem(key) {
	try {
		const storage = getLocalStorage();
		if (!storage || typeof storage.removeItem !== 'function') return false;

		storage.removeItem(key);
		return true;
	} catch (error) {
		return false;
	}
}
