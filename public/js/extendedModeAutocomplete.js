import {
    getIsoCode,
    getLocalTeamLogoPath,
    handleFlagError,
    handleTeamLogoError
} from './assets.js';

const MAX_SUGGESTIONS = 8;
const AUTOCOMPLETE_STYLE_URL = '/css/28-extended-mode-autocomplete.css';

function ensureAutocompleteStylesheet(documentObject) {
    const existing = documentObject?.querySelector?.('link[data-extended-autocomplete-style]');
    if (existing) return existing;
    const link = documentObject?.createElement?.('link');
    if (!link) return null;
    link.rel = 'stylesheet';
    link.href = AUTOCOMPLETE_STYLE_URL;
    link.dataset.extendedAutocompleteStyle = 'true';
    documentObject.head?.append?.(link);
    return link;
}

function normalizeSearchValue(value) {
    return String(value || '').trim().toLocaleLowerCase('ro-RO');
}

function getEntityType(variantKey) {
    if (variantKey === 'constructor') return 'constructor';
    if (variantKey === 'track') return 'track';
    return 'driver';
}

function getEntityCountry(entity, entityType) {
    return entityType === 'driver' ? entity?.nat : entity?.country;
}

function getEntityMeta(entity, entityType) {
    if (entityType === 'constructor') {
        return [entity?.country, entity?.active ? 'Activ' : 'Istoric'].filter(Boolean).join(' · ');
    }
    if (entityType === 'track') {
        return [entity?.country, entity?.firstGrandPrix ? `Primul GP ${entity.firstGrandPrix}` : ''].filter(Boolean).join(' · ');
    }
    return String(entity?.nat || '');
}

function createSuggestionVisual(documentObject, entity, entityType) {
    const image = documentObject.createElement('img');
    image.className = `extended-suggestion-visual is-${entityType}`;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 30;
    image.height = 20;
    image.setAttribute('aria-hidden', 'true');

    const teamLogoPath = entityType === 'constructor' ? getLocalTeamLogoPath(entity?.name) : null;
    if (teamLogoPath) {
        image.classList.add('is-logo');
        image.src = teamLogoPath;
        image.onerror = () => handleTeamLogoError(image);
        return image;
    }

    const isoCode = getIsoCode(getEntityCountry(entity, entityType));
    image.classList.add('is-flag');
    image.src = `/flags/${isoCode}.svg`;
    image.onerror = () => handleFlagError(image);
    return image;
}

function filterSuggestions(catalog, query) {
    const normalizedQuery = normalizeSearchValue(query);
    if (!normalizedQuery) return [];

    return (Array.isArray(catalog) ? catalog : [])
        .filter(entity => normalizeSearchValue(entity?.name).includes(normalizedQuery))
        .slice(0, MAX_SUGGESTIONS);
}

function createExtendedModeAutocomplete({
    documentObject,
    input,
    suggestions,
    getCatalog,
    getVariantKey,
    onSubmit
}) {
    ensureAutocompleteStylesheet(documentObject);

    let selectedEntityId = null;
    let activeIndex = -1;

    input?.setAttribute?.('role', 'combobox');
    input?.setAttribute?.('aria-autocomplete', 'list');
    input?.setAttribute?.('aria-controls', suggestions?.id || 'extendedSuggestions');
    input?.setAttribute?.('aria-expanded', 'false');

    function getSuggestionButtons() {
        return Array.from(suggestions?.querySelectorAll?.('[role="option"]') || suggestions?.children || []);
    }

    function clearActiveSuggestion() {
        for (const item of getSuggestionButtons()) {
            item.classList?.remove?.('is-active');
            item.setAttribute?.('aria-selected', 'false');
        }
        input?.removeAttribute?.('aria-activedescendant');
        activeIndex = -1;
    }

    function clearSuggestions() {
        suggestions?.replaceChildren?.();
        if (suggestions) suggestions.hidden = true;
        input?.setAttribute?.('aria-expanded', 'false');
        clearActiveSuggestion();
    }

    function resetSelection() {
        selectedEntityId = null;
        clearSuggestions();
    }

    function selectEntity(entity) {
        if (!entity) return false;
        selectedEntityId = entity.id;
        if (input) input.value = entity.name;
        clearSuggestions();
        if (typeof onSubmit === 'function') onSubmit();
        return true;
    }

    function createSuggestionButton(entity, index) {
        const entityType = getEntityType(getVariantKey?.());
        const button = documentObject.createElement('button');
        button.type = 'button';
        button.id = `extendedSuggestion-${index}`;
        button.className = 'extended-suggestion';
        button.dataset.entityId = entity.id;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');

        const copy = documentObject.createElement('span');
        copy.className = 'extended-suggestion-copy';
        const name = documentObject.createElement('strong');
        name.textContent = entity.name;
        const meta = documentObject.createElement('small');
        meta.textContent = getEntityMeta(entity, entityType);
        copy.append(name, meta);

        button.append(createSuggestionVisual(documentObject, entity, entityType), copy);
        button.addEventListener('click', () => selectEntity(entity));
        return button;
    }

    function renderSuggestions() {
        selectedEntityId = null;
        activeIndex = -1;
        input?.removeAttribute?.('aria-activedescendant');
        suggestions?.replaceChildren?.();

        const matches = filterSuggestions(getCatalog?.(), input?.value);
        if (matches.length === 0) {
            clearSuggestions();
            return [];
        }

        matches.forEach((entity, index) => {
            suggestions.append(createSuggestionButton(entity, index));
        });
        suggestions.hidden = false;
        input?.setAttribute?.('aria-expanded', 'true');
        return matches;
    }

    function setActiveSuggestion(nextIndex) {
        const items = getSuggestionButtons();
        if (items.length === 0) return false;

        for (const item of items) {
            item.classList?.remove?.('is-active');
            item.setAttribute?.('aria-selected', 'false');
        }
        activeIndex = (nextIndex + items.length) % items.length;
        const activeItem = items[activeIndex];
        activeItem.classList?.add?.('is-active');
        activeItem.setAttribute?.('aria-selected', 'true');
        input?.setAttribute?.('aria-activedescendant', activeItem.id);
        activeItem.scrollIntoView?.({ block: 'nearest' });
        return true;
    }

    function selectActiveSuggestion() {
        const activeItem = getSuggestionButtons()[activeIndex];
        if (!activeItem) return false;
        const entity = (getCatalog?.() || []).find(item => String(item?.id) === String(activeItem.dataset?.entityId));
        return selectEntity(entity);
    }

    function handleKeydown(event) {
        if (event.key === 'ArrowDown') {
            if (setActiveSuggestion(activeIndex + 1)) event.preventDefault?.();
            return true;
        }
        if (event.key === 'ArrowUp') {
            const items = getSuggestionButtons();
            const previousIndex = activeIndex < 0 ? items.length - 1 : activeIndex - 1;
            if (setActiveSuggestion(previousIndex)) event.preventDefault?.();
            return true;
        }
        if (event.key === 'Escape') {
            event.preventDefault?.();
            event.stopPropagation?.();
            clearSuggestions();
            return true;
        }
        if (event.key !== 'Enter') return false;

        event.preventDefault?.();
        if (!selectActiveSuggestion() && typeof onSubmit === 'function') onSubmit();
        return true;
    }

    return {
        clearSuggestions,
        ensureAutocompleteStylesheet,
    filterSuggestions,
        getSelectedEntityId: () => selectedEntityId,
        handleKeydown,
        renderSuggestions,
        resetSelection,
        selectActiveSuggestion,
        setActiveSuggestion
    };
}

export {
    AUTOCOMPLETE_STYLE_URL,
    MAX_SUGGESTIONS,
    createExtendedModeAutocomplete,
    ensureAutocompleteStylesheet,
    filterSuggestions,
    getEntityMeta,
    getEntityType,
    normalizeSearchValue
};
