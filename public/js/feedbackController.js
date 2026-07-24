import { createDialogFocusManager } from './dialogFocusManager.js';
import { safeGetItem, safeSetItem } from './safeStorage.js';

export const FEEDBACK_STORAGE_KEY = 'f1-guesser-feedback-settings';
export const DEFAULT_FEEDBACK_SETTINGS = Object.freeze({
    soundEnabled: true,
    soundVolume: 70,
    hapticsEnabled: true,
    hapticIntensity: 70
});

const SOUND_PATTERNS = Object.freeze({
    tap: [{ frequency: 520, duration: 0.035, gain: 0.025, type: 'sine' }],
    guess: [
        { frequency: 330, duration: 0.045, gain: 0.035, type: 'triangle' },
        { frequency: 440, duration: 0.055, gain: 0.035, type: 'triangle', delay: 0.04 }
    ],
    partial: [
        { frequency: 390, duration: 0.06, gain: 0.035, type: 'triangle' },
        { frequency: 520, duration: 0.07, gain: 0.035, type: 'triangle', delay: 0.055 }
    ],
    correct: [
        { frequency: 523.25, duration: 0.09, gain: 0.04, type: 'sine' },
        { frequency: 659.25, duration: 0.11, gain: 0.04, type: 'sine', delay: 0.07 },
        { frequency: 783.99, duration: 0.14, gain: 0.04, type: 'sine', delay: 0.14 }
    ],
    wrong: [{ frequency: 180, duration: 0.11, gain: 0.04, type: 'sawtooth' }],
    win: [
        { frequency: 523.25, duration: 0.1, gain: 0.045, type: 'triangle' },
        { frequency: 659.25, duration: 0.12, gain: 0.045, type: 'triangle', delay: 0.08 },
        { frequency: 880, duration: 0.18, gain: 0.045, type: 'triangle', delay: 0.17 }
    ],
    draw: [
        { frequency: 440, duration: 0.1, gain: 0.035, type: 'sine' },
        { frequency: 440, duration: 0.1, gain: 0.035, type: 'sine', delay: 0.13 }
    ],
    loss: [
        { frequency: 260, duration: 0.11, gain: 0.04, type: 'triangle' },
        { frequency: 190, duration: 0.16, gain: 0.04, type: 'triangle', delay: 0.1 }
    ],
    timeout: [
        { frequency: 310, duration: 0.08, gain: 0.035, type: 'square' },
        { frequency: 220, duration: 0.12, gain: 0.035, type: 'square', delay: 0.1 }
    ],
    error: [{ frequency: 160, duration: 0.13, gain: 0.04, type: 'square' }],
    preview: [
        { frequency: 440, duration: 0.07, gain: 0.035, type: 'sine' },
        { frequency: 660, duration: 0.1, gain: 0.035, type: 'sine', delay: 0.08 }
    ]
});

const HAPTIC_PATTERNS = Object.freeze({
    tap: [8],
    guess: [14],
    partial: [12, 28, 12],
    correct: [18, 30, 45],
    wrong: [35],
    win: [20, 35, 20, 35, 60],
    draw: [18, 45, 18],
    loss: [45, 35, 65],
    timeout: [50, 30, 50],
    error: [55],
    preview: [16, 32, 32]
});

const SILENT_BUTTON_IDS = new Set(['sendGuessBtn', 'feedbackPreviewBtn']);
const OUTGOING_GUESS_EVENTS = new Set(['submitGuess', 'submitSingleGuess', 'submitDailyGuess']);
const ROUND_OUTCOMES = new Set(['win', 'draw', 'loss']);
const GUESS_FEEDBACK_DEDUPE_MS = 80;
const SOUND_GAIN_BOOST = 4;
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;

function asBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function normalizePercent(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.round(Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, parsed)));
}

export function normalizeFeedbackSettings(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        soundEnabled: asBoolean(source.soundEnabled, DEFAULT_FEEDBACK_SETTINGS.soundEnabled),
        soundVolume: normalizePercent(source.soundVolume, DEFAULT_FEEDBACK_SETTINGS.soundVolume),
        hapticsEnabled: asBoolean(source.hapticsEnabled, DEFAULT_FEEDBACK_SETTINGS.hapticsEnabled),
        hapticIntensity: normalizePercent(source.hapticIntensity, DEFAULT_FEEDBACK_SETTINGS.hapticIntensity)
    };
}

export function parseFeedbackSettings(rawValue) {
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
        return { ...DEFAULT_FEEDBACK_SETTINGS };
    }
    try {
        return normalizeFeedbackSettings(JSON.parse(rawValue));
    } catch {
        return { ...DEFAULT_FEEDBACK_SETTINGS };
    }
}

export function classifyGuessFeedback({ results = {}, isCorrect = false } = {}) {
    if (isCorrect) return 'correct';
    const resultValues = results && typeof results === 'object' ? Object.values(results) : [];
    return resultValues.includes('green') ? 'partial' : 'wrong';
}

export function createSynthSoundPlayer({ windowObject = globalThis.window } = {}) {
    const AudioContextConstructor = windowObject?.AudioContext || windowObject?.webkitAudioContext;
    let audioContext = null;

    function getContext() {
        if (!AudioContextConstructor) return null;
        if (!audioContext) audioContext = new AudioContextConstructor();
        return audioContext;
    }

    function schedulePattern(context, effectName, volume) {
        const pattern = SOUND_PATTERNS[effectName] || SOUND_PATTERNS.tap;
        const volumeScale = normalizePercent(volume, DEFAULT_FEEDBACK_SETTINGS.soundVolume) / 100;
        if (volumeScale <= 0 || context.state === 'closed') return false;
        const baseTime = (context.currentTime || 0) + 0.005;
        for (const tone of pattern) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const startTime = baseTime + (Number(tone.delay) || 0);
            const endTime = startTime + tone.duration;
            const peakGain = Math.min(0.25, Math.max(0.0002, tone.gain * SOUND_GAIN_BOOST * volumeScale));
            oscillator.type = tone.type;
            oscillator.frequency.setValueAtTime(tone.frequency, startTime);
            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(startTime);
            oscillator.stop(endTime + 0.01);
        }
        return true;
    }

    function resumeContext(context) {
        if (context.state !== 'suspended' || typeof context.resume !== 'function') return null;
        try {
            return context.resume();
        } catch {
            return null;
        }
    }

    function playSynthSound(effectName, volume = DEFAULT_FEEDBACK_SETTINGS.soundVolume) {
        const context = getContext();
        if (!context || normalizePercent(volume, 0) <= 0) return false;
        const resumeResult = resumeContext(context);
        if (resumeResult && typeof resumeResult.then === 'function') {
            Promise.resolve(resumeResult)
                .then(() => schedulePattern(context, effectName, volume))
                .catch(() => {});
            return true;
        }
        return schedulePattern(context, effectName, volume);
    }

    playSynthSound.unlock = function unlock() {
        const context = getContext();
        if (!context) return false;
        const resumeResult = resumeContext(context);
        if (resumeResult && typeof resumeResult.catch === 'function') resumeResult.catch(() => {});
        return true;
    };

    return playSynthSound;
}

export function scaleHapticPattern(pattern, intensity = DEFAULT_FEEDBACK_SETTINGS.hapticIntensity) {
    const normalizedIntensity = normalizePercent(intensity, DEFAULT_FEEDBACK_SETTINGS.hapticIntensity);
    if (!Array.isArray(pattern) || normalizedIntensity <= 0) return [];
    const ratio = normalizedIntensity / 100;
    const pulseScale = 0.4 + (ratio * 1.2);
    const pauseScale = 0.75 + (ratio * 0.5);
    return pattern.map((duration, index) => Math.max(1, Math.round(duration * (index % 2 === 0 ? pulseScale : pauseScale))));
}

export function createHapticPlayer({ navigatorObject = globalThis.navigator } = {}) {
    return function playHaptic(effectName, intensity = DEFAULT_FEEDBACK_SETTINGS.hapticIntensity) {
        if (typeof navigatorObject?.vibrate !== 'function') return false;
        const pattern = scaleHapticPattern(HAPTIC_PATTERNS[effectName] || HAPTIC_PATTERNS.tap, intensity);
        if (pattern.length === 0) return false;
        try {
            return navigatorObject.vibrate(pattern) !== false;
        } catch {
            return false;
        }
    };
}

function findInteractiveTarget(eventTarget) {
    if (!eventTarget) return null;
    if (typeof eventTarget.closest === 'function') {
        return eventTarget.closest('button, summary, [role="button"]');
    }
    return ['BUTTON', 'SUMMARY'].includes(eventTarget.tagName) ? eventTarget : null;
}

export function createFeedbackController({
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    navigatorObject = globalThis.navigator,
    readStorage = safeGetItem,
    writeStorage = safeSetItem,
    playSoundEffect = createSynthSoundPlayer({ windowObject }),
    playHapticEffect = createHapticPlayer({ navigatorObject }),
    clock = Date.now
} = {}) {
    let settings = parseFeedbackSettings(readStorage(FEEDBACK_STORAGE_KEY, null));
    let dialogFocusManager = null;
    let lastTrigger = null;
    let setupComplete = false;
    let socket = null;
    let socketListeners = [];
    let outgoingHandler = null;
    let outgoingGuessEventsSupported = false;
    let lastGuessFeedbackAt = Number.NEGATIVE_INFINITY;

    function getElements() {
        return {
            panel: documentObject?.getElementById?.('feedbackSettingsPanel') || null,
            backdrop: documentObject?.getElementById?.('feedbackSettingsBackdrop') || null,
            closeBtn: documentObject?.getElementById?.('feedbackSettingsCloseBtn') || null,
            headerBtn: documentObject?.getElementById?.('feedbackSettingsBtn') || null,
            profileBtn: documentObject?.getElementById?.('authFeedbackSettingsBtn') || null,
            soundToggle: documentObject?.getElementById?.('feedbackSoundToggle') || null,
            soundVolume: documentObject?.getElementById?.('feedbackSoundVolume') || null,
            soundVolumeValue: documentObject?.getElementById?.('feedbackSoundVolumeValue') || null,
            hapticsToggle: documentObject?.getElementById?.('feedbackHapticsToggle') || null,
            hapticIntensity: documentObject?.getElementById?.('feedbackHapticIntensity') || null,
            hapticIntensityValue: documentObject?.getElementById?.('feedbackHapticIntensityValue') || null,
            previewBtn: documentObject?.getElementById?.('feedbackPreviewBtn') || null,
            summary: documentObject?.getElementById?.('authFeedbackSettingsSummary') || null,
            hapticsSupport: documentObject?.getElementById?.('feedbackHapticsSupport') || null,
            status: documentObject?.getElementById?.('feedbackSettingsStatus') || null
        };
    }

    function saveSettings() {
        writeStorage(FEEDBACK_STORAGE_KEY, JSON.stringify(settings));
    }

    function renderSettings() {
        const els = getElements();
        if (els.soundToggle) {
            els.soundToggle.checked = settings.soundEnabled;
            els.soundToggle.setAttribute?.('aria-checked', String(settings.soundEnabled));
        }
        if (els.soundVolume) {
            els.soundVolume.value = String(settings.soundVolume);
            els.soundVolume.disabled = !settings.soundEnabled;
        }
        if (els.soundVolumeValue) els.soundVolumeValue.textContent = `${settings.soundVolume}%`;
        if (els.hapticsToggle) {
            els.hapticsToggle.checked = settings.hapticsEnabled;
            els.hapticsToggle.setAttribute?.('aria-checked', String(settings.hapticsEnabled));
        }
        if (els.hapticIntensity) {
            els.hapticIntensity.value = String(settings.hapticIntensity);
            els.hapticIntensity.disabled = !settings.hapticsEnabled;
        }
        if (els.hapticIntensityValue) els.hapticIntensityValue.textContent = `${settings.hapticIntensity}%`;
        if (els.summary) {
            const soundSummary = settings.soundEnabled ? `${settings.soundVolume}%` : 'oprite';
            const hapticSummary = settings.hapticsEnabled ? `${settings.hapticIntensity}%` : 'oprite';
            els.summary.textContent = `Sunete: ${soundSummary} · Vibrații: ${hapticSummary}`;
        }
        if (els.hapticsSupport) {
            const supported = typeof navigatorObject?.vibrate === 'function';
            els.hapticsSupport.textContent = supported
                ? 'Intensitatea haptică ajustează durata și ritmul vibrației; browserul nu permite controlul amplitudinii.'
                : 'Browserul sau dispozitivul nu oferă vibrații; sunetele rămân disponibile.';
        }
    }

    function emitSettingsChanged() {
        if (typeof windowObject?.CustomEvent !== 'function' || typeof windowObject?.dispatchEvent !== 'function') return;
        windowObject.dispatchEvent(new windowObject.CustomEvent('f1guesser:feedback-settings-changed', {
            detail: { ...settings }
        }));
    }

    function updateSettings(nextSettings = {}) {
        settings = normalizeFeedbackSettings({ ...settings, ...nextSettings });
        saveSettings();
        renderSettings();
        emitSettingsChanged();
        return { ...settings };
    }

    function trigger(effectName = 'tap', { sound = true, haptic = true } = {}) {
        lastTrigger = effectName;
        let played = false;
        if (sound && settings.soundEnabled && settings.soundVolume > 0) {
            played = playSoundEffect(effectName, settings.soundVolume) || played;
        }
        if (haptic && settings.hapticsEnabled && settings.hapticIntensity > 0) {
            played = playHapticEffect(effectName, settings.hapticIntensity) || played;
        }
        return played;
    }

    function triggerGuessSubmission() {
        const now = Number(clock()) || 0;
        if (now - lastGuessFeedbackAt < GUESS_FEEDBACK_DEDUPE_MS) return false;
        lastGuessFeedbackAt = now;
        return trigger('guess');
    }

    function triggerGuessResult(payload = {}) {
        const effectName = classifyGuessFeedback(payload);
        trigger(effectName);
        return effectName;
    }

    function triggerRoundResult(outcome) {
        const effectName = ROUND_OUTCOMES.has(outcome) ? outcome : 'error';
        trigger(effectName);
        return effectName;
    }

    function addSocketListener(eventName, handler) {
        socket.on(eventName, handler);
        socketListeners.push({ eventName, handler });
    }

    function detachSocket() {
        if (!socket) return;
        if (typeof socket.off === 'function') {
            for (const { eventName, handler } of socketListeners) socket.off(eventName, handler);
        }
        if (outgoingHandler && typeof socket.offAnyOutgoing === 'function') {
            socket.offAnyOutgoing(outgoingHandler);
        }
        socket = null;
        socketListeners = [];
        outgoingHandler = null;
        outgoingGuessEventsSupported = false;
    }

    function attachSocket(nextSocket) {
        if (!nextSocket || typeof nextSocket.on !== 'function') return false;
        if (nextSocket === socket) return true;
        detachSocket();
        socket = nextSocket;

        addSocketListener('guessResult', payload => triggerGuessResult(payload));
        addSocketListener('dailyGuessResult', payload => triggerGuessResult(payload));
        addSocketListener('roundResolved', payload => {
            const outcome = payload?.resultForYou?.outcome;
            if (ROUND_OUTCOMES.has(outcome)) triggerRoundResult(outcome);
        });
        addSocketListener('gameTimedOut', payload => {
            const outcome = payload?.roundResult?.resultForYou?.outcome;
            if (ROUND_OUTCOMES.has(outcome)) triggerRoundResult(outcome);
            else trigger('timeout');
        });
        for (const eventName of ['roomFull', 'errorMessage', 'dailyChallengeError']) {
            addSocketListener(eventName, () => trigger('error'));
        }

        outgoingGuessEventsSupported = typeof socket.onAnyOutgoing === 'function';
        if (outgoingGuessEventsSupported) {
            outgoingHandler = eventName => {
                if (OUTGOING_GUESS_EVENTS.has(eventName)) triggerGuessSubmission();
            };
            socket.onAnyOutgoing(outgoingHandler);
        }
        return true;
    }

    function openPanel(sourceButton = null) {
        const els = getElements();
        if (!els.panel) return false;
        renderSettings();
        els.panel.classList?.add?.('show');
        els.backdrop?.classList?.add?.('show');
        els.backdrop?.setAttribute?.('aria-hidden', 'false');
        els.headerBtn?.setAttribute?.('aria-expanded', 'true');
        els.profileBtn?.setAttribute?.('aria-expanded', 'true');
        if (dialogFocusManager) {
            dialogFocusManager.activate({ focusTarget: els.soundToggle || els.closeBtn });
        } else {
            els.panel.inert = false;
            els.panel.setAttribute?.('aria-hidden', 'false');
            (els.soundToggle || els.closeBtn)?.focus?.();
        }
        if (sourceButton) sourceButton.dataset.feedbackDialogTrigger = 'active';
        return true;
    }

    function closePanel() {
        const els = getElements();
        if (!els.panel) return false;
        els.panel.classList?.remove?.('show');
        els.backdrop?.classList?.remove?.('show');
        els.backdrop?.setAttribute?.('aria-hidden', 'true');
        els.headerBtn?.setAttribute?.('aria-expanded', 'false');
        els.profileBtn?.setAttribute?.('aria-expanded', 'false');
        if (dialogFocusManager) {
            dialogFocusManager.deactivate({ fallbackFocus: els.profileBtn?.dataset?.feedbackDialogTrigger === 'active' ? els.profileBtn : els.headerBtn });
        } else {
            els.panel.inert = true;
            els.panel.setAttribute?.('aria-hidden', 'true');
        }
        if (els.headerBtn?.dataset) delete els.headerBtn.dataset.feedbackDialogTrigger;
        if (els.profileBtn?.dataset) delete els.profileBtn.dataset.feedbackDialogTrigger;
        return true;
    }

    function handleGlobalInteraction(event) {
        const target = findInteractiveTarget(event?.target);
        if (!target || target.disabled || target.getAttribute?.('aria-disabled') === 'true') return;
        if (target.id === 'sendGuessBtn') {
            if (!outgoingGuessEventsSupported) triggerGuessSubmission();
            return;
        }
        if (target.dataset?.feedbackSilent === 'true' || SILENT_BUTTON_IDS.has(target.id)) return;
        trigger('tap');
    }

    function handleGuessKeyboardFallback(event) {
        if (outgoingGuessEventsSupported || event?.key !== 'Enter' || event?.repeat) return;
        if (event?.target?.id === 'driverInput') triggerGuessSubmission();
    }

    function setup() {
        if (setupComplete) return true;
        const els = getElements();
        if (!els.panel) return false;
        renderSettings();
        if (!dialogFocusManager) {
            dialogFocusManager = createDialogFocusManager({
                dialog: els.panel,
                onEscape: closePanel,
                getInitialFocus: () => els.soundToggle || els.closeBtn
            });
        }
        for (const button of [els.headerBtn, els.profileBtn]) {
            if (!button) continue;
            button.setAttribute?.('aria-haspopup', 'dialog');
            button.setAttribute?.('aria-controls', 'feedbackSettingsPanel');
            button.setAttribute?.('aria-expanded', 'false');
            button.addEventListener?.('click', () => openPanel(button));
        }
        els.closeBtn?.addEventListener?.('click', closePanel);
        els.backdrop?.addEventListener?.('click', closePanel);
        els.soundToggle?.addEventListener?.('change', event => {
            updateSettings({ soundEnabled: Boolean(event.target?.checked) });
            if (settings.soundEnabled) {
                playSoundEffect.unlock?.();
                trigger('tap', { haptic: false });
            }
        });
        els.soundVolume?.addEventListener?.('input', event => {
            updateSettings({ soundVolume: event.target?.value });
        });
        els.soundVolume?.addEventListener?.('change', () => {
            if (settings.soundEnabled) trigger('preview', { haptic: false });
        });
        els.hapticsToggle?.addEventListener?.('change', event => {
            updateSettings({ hapticsEnabled: Boolean(event.target?.checked) });
            if (settings.hapticsEnabled) trigger('tap', { sound: false });
        });
        els.hapticIntensity?.addEventListener?.('input', event => {
            updateSettings({ hapticIntensity: event.target?.value });
        });
        els.hapticIntensity?.addEventListener?.('change', () => {
            if (settings.hapticsEnabled) trigger('preview', { sound: false });
        });
        els.previewBtn?.addEventListener?.('click', () => {
            const played = trigger('preview');
            if (els.status) {
                els.status.textContent = played
                    ? 'Feedback de test redat cu setările active.'
                    : 'Activează sunetul sau vibrațiile pentru a testa feedback-ul.';
            }
        });
        const unlockAudio = () => {
            if (settings.soundEnabled) playSoundEffect.unlock?.();
        };
        documentObject?.addEventListener?.('pointerdown', unlockAudio, { capture: true, once: true });
        documentObject?.addEventListener?.('keydown', unlockAudio, { capture: true, once: true });
        documentObject?.addEventListener?.('click', handleGlobalInteraction);
        documentObject?.addEventListener?.('keydown', handleGuessKeyboardFallback);
        setupComplete = true;
        return true;
    }

    return {
        setup,
        attachSocket,
        detachSocket,
        openPanel,
        closePanel,
        trigger,
        triggerGuessSubmission,
        triggerGuessResult,
        triggerRoundResult,
        updateSettings,
        getSettings: () => ({ ...settings }),
        getLastTrigger: () => lastTrigger,
        isHapticsSupported: () => typeof navigatorObject?.vibrate === 'function'
    };
}

export function installFeedbackController(windowObject = globalThis.window) {
    if (!windowObject?.document) return null;
    if (windowObject.__f1FeedbackController) return windowObject.__f1FeedbackController;

    const controller = createFeedbackController({
        documentObject: windowObject.document,
        windowObject,
        navigatorObject: windowObject.navigator
    });
    controller.setup();
    windowObject.addEventListener?.('f1:socket-created', event => controller.attachSocket(event.detail?.socket));
    if (windowObject.__f1GameSocket) controller.attachSocket(windowObject.__f1GameSocket);
    windowObject.__f1FeedbackController = controller;
    return controller;
}

if (typeof window !== 'undefined' && window.document) installFeedbackController(window);
