const DEFAULT_TOAST_DURATION = 3200;
const TOAST_TYPES = new Set(['info', 'success', 'warning', 'error']);

function getToastContainer() {
	let container = document.getElementById('toastContainer');
	if (container) return container;

	container = document.createElement('div');
	container.id = 'toastContainer';
	container.className = 'toast-container';
	container.setAttribute('aria-live', 'polite');
	container.setAttribute('aria-atomic', 'false');
	document.body.appendChild(container);
	return container;
}

function getToastIcon(type) {
	switch (type) {
		case 'success': return '✅';
		case 'warning': return '⚠️';
		case 'error': return '❌';
		default: return 'ℹ️';
	}
}

export function showToast(message, { type = 'info', duration = DEFAULT_TOAST_DURATION } = {}) {
	if (!message || typeof document === 'undefined') return null;

	const safeType = TOAST_TYPES.has(type) ? type : 'info';
	const container = getToastContainer();
	const toast = document.createElement('div');
	toast.className = `toast toast-${safeType}`;
	toast.setAttribute('role', safeType === 'error' ? 'alert' : 'status');

	const icon = document.createElement('span');
	icon.className = 'toast-icon';
	icon.setAttribute('aria-hidden', 'true');
	icon.textContent = getToastIcon(safeType);

	const text = document.createElement('span');
	text.className = 'toast-message';
	text.textContent = message;

	const closeBtn = document.createElement('button');
	closeBtn.type = 'button';
	closeBtn.className = 'toast-close';
	closeBtn.setAttribute('aria-label', 'Închide notificarea');
	closeBtn.textContent = '×';

	let removeTimer = null;
	function removeToast() {
		if (removeTimer) window.clearTimeout(removeTimer);
		toast.classList.add('toast-hiding');
		window.setTimeout(() => toast.remove(), 180);
	}

	closeBtn.addEventListener('click', removeToast);
	toast.append(icon, text, closeBtn);
	container.appendChild(toast);

	if (duration > 0) {
		removeTimer = window.setTimeout(removeToast, duration);
	}

	return toast;
}

export function showInfoToast(message, options = {}) {
	return showToast(message, { ...options, type: 'info' });
}

export function showSuccessToast(message, options = {}) {
	return showToast(message, { ...options, type: 'success' });
}

export function showWarningToast(message, options = {}) {
	return showToast(message, { ...options, type: 'warning' });
}

export function showErrorToast(message, options = {}) {
	return showToast(message, { ...options, type: 'error', duration: options.duration ?? 4500 });
}
