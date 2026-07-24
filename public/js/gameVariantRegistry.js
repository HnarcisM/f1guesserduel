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
            defaultSelected: true,
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
            description: 'Ghicește mai mulți piloți înainte ca timpul total să expire.',
            context: 'single',
            state: GAME_VARIANT_STATES.COMING_SOON,
            tags: Object.freeze(['Scor', 'Contra cronometru'])
        }),
        Object.freeze({
            key: 'era',
            title: 'Era Challenge',
            icon: '🏛️',
            description: 'Alege o perioadă din istoria Formulei 1 și joacă doar cu acei piloți.',
            context: 'single',
            state: GAME_VARIANT_STATES.COMING_SOON,
            tags: Object.freeze(['Filtre istorice', 'Solo'])
        }),
        Object.freeze({
            key: 'streak',
            title: 'Streak',
            icon: '🔥',
            description: 'Continuă seria cât timp ghicești corect și depășește-ți recordul.',
            context: 'single',
            state: GAME_VARIANT_STATES.COMING_SOON,
            tags: Object.freeze(['Serii', 'Record personal'])
        }),
        Object.freeze({
            key: 'weekly',
            title: 'Weekly Challenge',
            icon: '📅',
            description: 'O provocare specială comună tuturor jucătorilor în fiecare săptămână.',
            context: 'daily',
            state: GAME_VARIANT_STATES.COMING_SOON,
            requiresAccount: true,
            tags: Object.freeze(['Săptămânal', 'Necesită cont'])
        }),
        Object.freeze({
            key: 'constructor',
            title: 'Constructor Guesser',
            icon: '🏎️',
            description: 'Identifică echipa pe baza istoriei, țării și performanțelor sale.',
            context: 'single',
            state: GAME_VARIANT_STATES.COMING_SOON,
            tags: Object.freeze(['Constructori', 'Date noi'])
        }),
        Object.freeze({
            key: 'pilot-sudoku',
            title: 'Pilot Sudoku',
            icon: '🧩',
            description: 'Completează grila cu piloți care respectă simultan două criterii.',
            context: 'single',
            state: GAME_VARIANT_STATES.COMING_SOON,
            tags: Object.freeze(['Puzzle', 'Grilă 3×3'])
        }),
        Object.freeze({
            key: 'track',
            title: 'Track Guesser',
            icon: '🗺️',
            description: 'Recunoaște circuitele după configurație și caracteristici.',
            context: 'single',
            state: GAME_VARIANT_STATES.COMING_SOON,
            tags: Object.freeze(['Circuite', 'Siluete'])
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
