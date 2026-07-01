import { showErrorToast, showSuccessToast } from './toastController.js';


const ROOM_CLIENT_ID_STORAGE_KEY = 'f1guesserduel.tabClientId';

function createRoomClientId() {
	if (window.crypto?.randomUUID) {
		return window.crypto.randomUUID().replace(/-/g, '');
	}
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function getRoomClientId() {
	try {
		const existing = sessionStorage.getItem(ROOM_CLIENT_ID_STORAGE_KEY);
		if (existing && /^[a-zA-Z0-9_-]+$/.test(existing)) return existing;

		const nextId = createRoomClientId();
		sessionStorage.setItem(ROOM_CLIENT_ID_STORAGE_KEY, nextId);
		return nextId;
	} catch (error) {
		return createRoomClientId();
	}
}


function fallbackCopyText(text, onCopied) {
	const textArea = document.createElement('textarea');
	textArea.value = text;
	textArea.classList.add('fallback-copy-textarea');
	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();
	try {
		document.execCommand('copy');
		onCopied();
	} catch (err) {
		console.error('Fallback eșuat completely:', err);
		showErrorToast('Nu s-a putut copia automat. Link-ul tău este: ' + text, { duration: 7000 });
	}
	document.body.removeChild(textArea);
}

export function setupShareButton() {
	const shareBtn = document.getElementById('shareRoomBtn');
	if (!shareBtn) return;

	function triggerTooltip() {
		shareBtn.classList.add('copied');
		showSuccessToast('Link-ul camerei a fost copiat.');
		setTimeout(() => shareBtn.classList.remove('copied'), 2000);
	}

	shareBtn.addEventListener('click', () => {
		const currentUrl = window.location.href;

		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(currentUrl)
				.then(triggerTooltip)
				.catch(err => {
					console.error('Eroare la copiere nativă:', err);
					fallbackCopyText(currentUrl, triggerTooltip);
				});
		} else {
			fallbackCopyText(currentUrl, triggerTooltip);
		}
	});
}

export function getRoomIdFromUrl() {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get('room');
}

function generateRoomId() {
	return Math.random().toString(36).substring(2, 9);
}

function updateRoomUi(roomId) {
	const roomBtnTextEl = document.getElementById('roomBtnText');
	if (roomBtnTextEl) {
		roomBtnTextEl.textContent = roomId ? `🏁 Room: ${roomId}` : '🏁 Duel inactive';
	}

	const linkTextEl = document.getElementById('linkText');
	if (linkTextEl) linkTextEl.innerText = window.location.href;
}

export function clearRoomFromUrl() {
	const url = new URL(window.location.href);
	if (!url.searchParams.has('room')) return;
	url.searchParams.delete('room');
	window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function setupRoom({ getSocket, onRoomJoined, roomId: requestedRoomId, updateUrl = true } = {}) {
	const existingRoomId = getRoomIdFromUrl();
	const roomId = requestedRoomId || existingRoomId || generateRoomId();

	if (updateUrl) {
		const url = new URL(window.location.href);
		url.searchParams.set('room', roomId);
		window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
	}

	updateRoomUi(roomId);
	onRoomJoined?.(roomId);

	const socket = getSocket?.();
	if (socket) {
		socket.emit('joinRoom', {
			roomId,
			clientId: getRoomClientId()
		});
	}

	return roomId;
}

export function resetRoomUi() {
	updateRoomUi(null);
}
