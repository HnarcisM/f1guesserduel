export const STYLE_URL = '/css/24-extended-modes.css';
export const RECORDS_KEY = 'f1-guesser-extended-records-v1';
export const VARIANT_COPY = Object.freeze({
    'speed-run': {
        title: 'Speed Run',
        eyebrow: '5 piloți · 90 secunde',
        description: 'Ghicește cât mai repede. Poți sări o rundă cu o penalizare de 250 puncte.',
        comparisonEntityType: 'driver'
    },
    era: {
        title: 'Era Challenge',
        eyebrow: 'Filtru istoric',
        description: 'Alege era, apoi identifică pilotul în maximum șase încercări.',
        comparisonEntityType: 'driver'
    },
    streak: {
        title: 'Streak',
        eyebrow: 'Serie nelimitată',
        description: 'Ai doar trei încercări pentru fiecare pilot. Prima rundă pierdută încheie seria.',
        comparisonEntityType: 'driver'
    },
    weekly: {
        title: 'Weekly Challenge',
        eyebrow: 'O încercare oficială pe săptămână',
        description: 'Alege dificultatea și ghicește aceeași secvență de cinci piloți ca ceilalți jucători în 120 de secunde.',
        comparisonEntityType: 'driver'
    },
    constructor: {
        title: 'Constructor Guesser',
        eyebrow: 'Istoria echipelor',
        description: 'Compară țara, debutul, titlurile, statutul și era constructorului.',
        comparisonEntityType: 'constructor'
    },
    'pilot-sudoku': {
        title: 'Pilot Sudoku',
        eyebrow: 'Puzzle 3×3',
        description: 'Fiecare pilot trebuie să respecte criteriul rândului și al coloanei și nu poate fi reutilizat.'
    },
    track: {
        title: 'Track Guesser',
        eyebrow: 'Siluete de circuit',
        description: 'Recunoaște circuitul și folosește comparațiile tehnice ca indicii.'
    }
});
export const ERA_OPTIONS = Object.freeze([
    { key: 'pioneers', title: 'Pioneers', description: 'Debut înainte de 1970' },
    { key: 'classic', title: 'Classic', description: 'Debut 1970–1989' },
    { key: 'modern', title: 'Modern', description: 'Debut 1990–2009' },
    { key: 'hybrid', title: 'Hybrid', description: 'Debut 2010–2019' },
    { key: 'current', title: 'Current', description: 'Debut din 2020' }
]);
