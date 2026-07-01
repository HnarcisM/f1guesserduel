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
		alert('Nu s-a putut copia automat. Link-ul tău este: ' + text);
	}
	document.body.removeChild(textArea);
}

export function setupShareButton() {
	const shareBtn = document.getElementById('shareRoomBtn');
	if (!shareBtn) return;

	function triggerTooltip() {
		shareBtn.classList.add('copied');
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

export function setupRoom({ getSocket }) {
	let roomId = getRoomIdFromUrl();

	if (!roomId) {
		roomId = Math.random().toString(36).substring(2, 9);
		window.history.pushState({}, '', `?room=${roomId}`);
	}

	const roomBtnTextEl = document.getElementById('roomBtnText');
	if (roomBtnTextEl) {
		roomBtnTextEl.textContent = `🏁 Room: ${roomId}`;
	}

	const linkTextEl = document.getElementById('linkText');
	if (linkTextEl) linkTextEl.innerText = window.location.href;

	const socket = getSocket();
	if (socket) {
		socket.emit('joinRoom', roomId);
	}

	return roomId;
}
