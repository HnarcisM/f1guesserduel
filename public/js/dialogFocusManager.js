const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

function isFocusable(element) {
    if (!element || element.disabled || element.hidden) return false;
    if (element.getAttribute?.('aria-hidden') === 'true') return false;
    if (element.classList?.contains?.('is-hidden')) return false;
    if (element.closest?.('[hidden], [aria-hidden="true"], .is-hidden')) return false;
    return typeof element.focus === 'function';
}

export function getDialogFocusableElements(dialog) {
    if (!dialog?.querySelectorAll) return [];
    return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusable);
}

export function createDialogFocusManager({ dialog, onEscape, getInitialFocus } = {}) {
    if (!dialog) return null;
    let previouslyFocused = null;

    function activate({ focusTarget = null } = {}) {
        previouslyFocused = document.activeElement || null;
        dialog.inert = false;
        dialog.setAttribute?.('aria-hidden', 'false');
        const focusable = getDialogFocusableElements(dialog);
        const target = focusTarget || getInitialFocus?.() || focusable[0] || dialog;
        target?.focus?.();
    }

    function deactivate({ restoreFocus = true, fallbackFocus = null } = {}) {
        dialog.inert = true;
        dialog.setAttribute?.('aria-hidden', 'true');
        const target = fallbackFocus || previouslyFocused;
        previouslyFocused = null;
        if (restoreFocus) target?.focus?.();
    }

    function handleKeydown(event) {
        if (dialog.getAttribute?.('aria-hidden') === 'true') return;

        if (event.key === 'Escape') {
            event.preventDefault?.();
            event.stopPropagation?.();
            onEscape?.();
            return;
        }

        if (event.key !== 'Tab') return;
        const focusable = getDialogFocusableElements(dialog);
        if (focusable.length === 0) {
            event.preventDefault?.();
            dialog.focus?.();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault?.();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault?.();
            first.focus();
        }
    }

    dialog.addEventListener?.('keydown', handleKeydown);
    return { activate, deactivate, handleKeydown };
}
