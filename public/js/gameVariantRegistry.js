(function installGameVariantRegistry(globalObject) {
    'use strict';

    const GAME_VARIANT_STATES = Object.freeze({
        AVAILABLE: 'available',
        COMING_SOON: 'coming-soon'
    });

    const GAME_VARIANTS = Object.freeze([
        Object.freeze({
            key: 'classic',
            title: 'Classic',
            icon: '🎯',
            description: 'Experiența originală F1 Guesser, cu maximum șase încercări.',
            context: 'single',
            modeChoice: 'single',
            state: GAME_VARIANT_STATES.AVAILABLE,
            tags: Object.freeze(['Solo', 'Timer opțional'])
        }),
        Object.freeze({
            key: 'daily',
            title: 'Daily Challenge',
            icon: '🌅',
            description: 'Aceeași provocare zilnică pentru fiecare dificultate.',
            context: 'daily',
            modeChoice: 'daily',
            state: GAME_VARIANT_STATES.AVAILABLE,
            requiresAccount: true,
            tags: Object.freeze(['Zilnic', 'Necesită cont'])
        }),
        Object.freeze({
            key: 'duel',
            title: 'Duel',
            icon: '⚔️',
            description: 'Creează o cameră și joacă în timp real cu un prieten.',
            context: 'duel',
            modeChoice: 'duel',
            state: GAME_VARIANT_STATES.AVAILABLE,
            tags: Object.freeze(['2 jucători', 'Spectatori'])
        }),
        Object.freeze({
            key: 'speed-run',
            title: 'Speed Run',
            icon: '⏱️',
            description: 'Ghicește cinci piloți înainte ca timpul total să expire.',
            context: 'single',
            launchType: 'extended',
            state: GAME_VARIANT_STATES.AVAILABLE,
            tags: Object.freeze(['5 runde', '90 secunde', 'Scor'])
        }),
        Object.freeze({
            key: 'era',
            title: 'Era Challenge',
            icon: '🏛️',
            description: 'Alege o perioadă din istoria Formulei 1 și joacă doar cu acei piloți.',
            context: 'single',
            launchType: 'extended',
            state: GAME_VARIANT_STATES.AVAILABLE,
            tags: Object.freeze(['5 ere', 'Solo'])
        }),
        Object.freeze({
            key: 'streak',
            title: 'Streak',
            icon: '🔥',
            description: 'Continuă seria cât timp ghicești pilotul în maximum trei încercări.',
            context: 'single',
            launchType: 'extended',
            state: GAME_VARIANT_STATES.AVAILABLE,
            tags: Object.freeze(['3 încercări', 'Record personal'])
        }),
        Object.freeze({
            key: 'weekly',
            title: 'Weekly Challenge',
            icon: '📅',
            description: 'O singură încercare oficială pe săptămână, cu aceeași secvență pentru fiecare dificultate.',
            context: 'daily',
            launchType: 'extended',
            state: GAME_VARIANT_STATES.AVAILABLE,
            requiresAccount: true,
            tags: Object.freeze(['5 runde', 'Necesită cont', '1× pe săptămână'])
        }),
        Object.freeze({
            key: 'constructor',
            title: 'Constructor Guesser',
            icon: '🏎️',
            description: 'Identifică echipa pe baza țării, debutului, titlurilor și erei.',
            context: 'single',
            launchType: 'extended',
            state: GAME_VARIANT_STATES.AVAILABLE,
            tags: Object.freeze(['Constructori', '6 încercări'])
        }),
        Object.freeze({
            key: 'pilot-sudoku',
            title: 'Pilot Sudoku',
            icon: '🧩',
            description: 'Completează grila 3×3 cu nouă piloți diferiți care respectă două criterii.',
            context: 'single',
            launchType: 'extended',
            state: GAME_VARIANT_STATES.AVAILABLE,
            tags: Object.freeze(['Puzzle', 'Grilă 3×3'])
        }),
        Object.freeze({
            key: 'track',
            title: 'Track Guesser',
            icon: '🗺️',
            description: 'Recunoaște circuitul după siluetă și compară datele tehnice.',
            context: 'single',
            launchType: 'extended',
            state: GAME_VARIANT_STATES.AVAILABLE,
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

    const api = Object.freeze({
        GAME_VARIANTS,
        GAME_VARIANT_STATES,
        getGameVariant,
        isGameVariantAvailable,
        listGameVariants,
        listGameVariantsByState
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (globalObject) globalObject.F1GameVariantRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : null);
