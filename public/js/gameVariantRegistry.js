(function installGameVariantRegistry(globalObject) {
    'use strict';

    const GAME_VARIANT_STATES = Object.freeze({
        AVAILABLE: 'available',
        COMING_SOON: 'coming-soon'
    });

    const HUB_GROUPS = Object.freeze({
        SINGLE: 'single-player',
        DUEL: 'duel',
        SPECIALTY: 'specialty'
    });

    const GAME_VARIANTS = Object.freeze([
        Object.freeze({
            key: 'classic',
            title: 'Classic',
            iconKey: 'target',
            description: 'Experiența originală F1 Guesser, cu maximum șase încercări.',
            context: 'single',
            modeChoice: 'single',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SINGLE,
            tags: Object.freeze(['Solo', 'Timer opțional'])
        }),
        Object.freeze({
            key: 'daily',
            title: 'Daily Challenge',
            iconKey: 'sunrise',
            description: 'Aceeași provocare zilnică pentru fiecare dificultate.',
            context: 'daily',
            modeChoice: 'daily',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SINGLE,
            requiresAccount: true,
            tags: Object.freeze(['Zilnic', 'Necesită cont'])
        }),
        Object.freeze({
            key: 'duel',
            title: 'Duel',
            iconKey: 'swords',
            description: 'Creează o cameră și joacă în timp real cu un prieten.',
            context: 'duel',
            modeChoice: 'duel',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.DUEL,
            tags: Object.freeze(['2 jucători', 'Spectatori'])
        }),
        Object.freeze({
            key: 'speed-run',
            title: 'Speed Run',
            iconKey: 'stopwatch',
            description: 'Ghicește cinci piloți înainte ca timpul total să expire.',
            context: 'single',
            pagePath: '/modes/speed-run/',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SPECIALTY,
            tags: Object.freeze(['5 runde', '90 secunde', 'Scor'])
        }),
        Object.freeze({
            key: 'era',
            title: 'Era Challenge',
            iconKey: 'landmark',
            description: 'Alege o perioadă din istoria Formulei 1 și joacă doar cu acei piloți.',
            context: 'single',
            pagePath: '/modes/era/',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SINGLE,
            tags: Object.freeze(['5 ere', 'Solo'])
        }),
        Object.freeze({
            key: 'streak',
            title: 'Streak',
            iconKey: 'flame',
            description: 'Continuă seria cât timp ghicești pilotul în maximum trei încercări.',
            context: 'single',
            pagePath: '/modes/streak/',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SPECIALTY,
            tags: Object.freeze(['3 încercări', 'Record personal'])
        }),
        Object.freeze({
            key: 'weekly',
            title: 'Weekly Challenge',
            iconKey: 'calendar',
            description: 'O singură încercare oficială pe săptămână, cu aceeași secvență pentru fiecare dificultate.',
            context: 'daily',
            pagePath: '/modes/weekly/',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SINGLE,
            requiresAccount: true,
            tags: Object.freeze(['5 runde', 'Necesită cont', '1× pe săptămână'])
        }),
        Object.freeze({
            key: 'constructor',
            title: 'Constructor Guesser',
            iconKey: 'car',
            description: 'Identifică echipa pe baza țării, debutului, titlurilor și erei.',
            context: 'single',
            pagePath: '/modes/constructor/',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SPECIALTY,
            tags: Object.freeze(['Constructori', '6 încercări'])
        }),
        Object.freeze({
            key: 'pilot-sudoku',
            title: 'Pilot Sudoku',
            iconKey: 'puzzle',
            description: 'Completează grila 3×3 cu nouă piloți diferiți care respectă două criterii.',
            context: 'single',
            pagePath: '/modes/pilot-sudoku/',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SPECIALTY,
            tags: Object.freeze(['Puzzle', 'Grilă 3×3'])
        }),
        Object.freeze({
            key: 'track',
            title: 'Track Guesser',
            iconKey: 'map',
            description: 'Recunoaște circuitul după siluetă și compară datele tehnice.',
            context: 'single',
            pagePath: '/modes/track/',
            state: GAME_VARIANT_STATES.AVAILABLE,
            hubGroup: HUB_GROUPS.SPECIALTY,
            hubLayout: 'wide',
            tags: Object.freeze(['Circuite', 'Siluete', '6 încercări'])
        })
    ]);

    function listGameVariants() {
        return [...GAME_VARIANTS];
    }

    function getGameVariant(key) {
        return GAME_VARIANTS.find(variant => variant.key === key) || null;
    }

    function isGameVariantAvailable(key) {
        return getGameVariant(key)?.state === GAME_VARIANT_STATES.AVAILABLE;
    }

    function listGameVariantsByState(state) {
        return GAME_VARIANTS.filter(variant => variant.state === state);
    }

    function listGameVariantsByGroup(group) {
        return GAME_VARIANTS.filter(variant => variant.hubGroup === group);
    }

    const api = Object.freeze({
        GAME_VARIANTS,
        GAME_VARIANT_STATES,
        HUB_GROUPS,
        getGameVariant,
        isGameVariantAvailable,
        listGameVariants,
        listGameVariantsByGroup,
        listGameVariantsByState
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (globalObject) globalObject.F1GameVariantRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : null);
