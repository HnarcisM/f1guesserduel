'use strict';

const { compareGuess } = require('./compareDriver');
const { ERA_FILTERS } = require('./extendedModesConstants');

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeId(value) {
    return normalizeString(value).toLowerCase();
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function hashString(input) {
    let hash = 2166136261;
    const text = String(input || '');
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seedInput) {
    let seed = hashString(seedInput) || 0x9e3779b9;
    return function seededRandom() {
        seed += 0x6D2B79F5;
        let value = seed;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function sampleUnique(values, count, random = Math.random) {
    return shuffle(values, random).slice(0, Math.max(0, count));
}

function normalizeDriver(driver) {
    if (!driver || typeof driver !== 'object') return null;
    const id = normalizeString(driver.id).toUpperCase();
    const name = normalizeString(driver.name);
    if (!id || !name) return null;
    const team = Array.isArray(driver.team)
        ? driver.team.map(normalizeString).filter(Boolean)
        : [normalizeString(driver.team)].filter(Boolean);
    return Object.freeze({
        id,
        name,
        nat: normalizeString(driver.nat).toUpperCase(),
        team: Object.freeze(team),
        age: safeInteger(driver.age, 0),
        debut: safeInteger(driver.debut, 0),
        wins: Math.max(0, safeInteger(driver.wins, 0)),
        difficulty: normalizeString(driver.difficulty).toLowerCase() || 'all'
    });
}

function normalizeDrivers(drivers) {
    const seen = new Set();
    const normalized = [];
    for (const driver of Array.isArray(drivers) ? drivers : []) {
        const entry = normalizeDriver(driver);
        if (!entry || seen.has(entry.id)) continue;
        seen.add(entry.id);
        normalized.push(entry);
    }
    return Object.freeze(normalized);
}

function publicDriver(driver) {
    if (!driver) return null;
    return {
        id: driver.id,
        name: driver.name,
        nat: driver.nat,
        team: [...driver.team],
        age: driver.age,
        debut: driver.debut,
        wins: driver.wins,
        difficulty: driver.difficulty
    };
}

function publicConstructor(constructor) {
    if (!constructor) return null;
    return {
        id: constructor.id,
        name: constructor.name,
        country: constructor.country,
        debut: constructor.debut,
        championships: constructor.championships,
        active: constructor.active,
        era: constructor.era
    };
}

function publicTrack(track, { includeLayout = false } = {}) {
    if (!track) return null;
    const payload = {
        id: track.id,
        name: track.name,
        country: track.country,
        firstGrandPrix: track.firstGrandPrix,
        lengthKm: track.lengthKm,
        corners: track.corners,
        direction: track.direction
    };
    if (includeLayout) payload.layout = track.layout.map(point => [...point]);
    return payload;
}

function getCurrentTeam(driver) {
    return Array.isArray(driver?.team) && driver.team.length > 0 ? driver.team[0] : '—';
}

function numericState(guessValue, targetValue) {
    if (guessValue === targetValue) return 'green';
    return targetValue > guessValue ? 'orange' : 'purple';
}

function exactState(guessValue, targetValue) {
    return guessValue === targetValue ? 'green' : 'red';
}

function buildDriverFeedback(guess, target) {
    const results = compareGuess(guess, target);
    return {
        entityType: 'driver',
        guess: publicDriver(guess),
        cells: [
            { key: 'name', label: 'Pilot', value: guess.name, state: results.name },
            { key: 'nat', label: 'Țară', value: guess.nat, state: results.nat },
            { key: 'team', label: 'Echipă', value: getCurrentTeam(guess), state: results.team },
            { key: 'age', label: 'Vârstă', value: guess.age, state: results.age },
            { key: 'debut', label: 'Debut', value: guess.debut, state: results.debut },
            { key: 'wins', label: 'Victorii', value: guess.wins, state: results.wins }
        ]
    };
}

function buildConstructorFeedback(guess, target) {
    return {
        entityType: 'constructor',
        guess: publicConstructor(guess),
        cells: [
            { key: 'name', label: 'Constructor', value: guess.name, state: exactState(guess.id, target.id) },
            { key: 'country', label: 'Țară', value: guess.country, state: exactState(guess.country, target.country) },
            { key: 'debut', label: 'Debut', value: guess.debut, state: numericState(guess.debut, target.debut) },
            { key: 'championships', label: 'Titluri', value: guess.championships, state: numericState(guess.championships, target.championships) },
            { key: 'active', label: 'Status', value: guess.active ? 'Activ' : 'Istoric', state: exactState(guess.active, target.active) },
            { key: 'era', label: 'Eră', value: guess.era, state: exactState(guess.era, target.era) }
        ]
    };
}

function buildTrackFeedback(guess, target) {
    return {
        entityType: 'track',
        guess: publicTrack(guess),
        cells: [
            { key: 'name', label: 'Circuit', value: guess.name, state: exactState(guess.id, target.id) },
            { key: 'country', label: 'Țară', value: guess.country, state: exactState(guess.country, target.country) },
            { key: 'firstGrandPrix', label: 'Primul GP', value: guess.firstGrandPrix, state: numericState(guess.firstGrandPrix, target.firstGrandPrix) },
            { key: 'lengthKm', label: 'Lungime', value: `${guess.lengthKm.toFixed(3)} km`, state: numericState(guess.lengthKm, target.lengthKm) },
            { key: 'corners', label: 'Viraje', value: guess.corners, state: numericState(guess.corners, target.corners) },
            { key: 'direction', label: 'Sens', value: guess.direction === 'clockwise' ? 'Orar' : 'Antiorar', state: exactState(guess.direction, target.direction) }
        ]
    };
}

function findEra(key) {
    return ERA_FILTERS.find(era => era.key === normalizeId(key)) || ERA_FILTERS.at(-1);
}

function filterDriversByEra(drivers, eraKey) {
    const era = findEra(eraKey);
    return drivers.filter(driver => driver.debut >= era.from && driver.debut <= era.to);
}

function filterDriversByDifficulty(drivers, difficulty) {
    const normalized = normalizeId(difficulty);
    if (!['easy', 'medium', 'hard'].includes(normalized)) return [...drivers];
    const filtered = drivers.filter(driver => driver.difficulty === normalized);
    return filtered.length > 0 ? filtered : [...drivers];
}

function getTargetById(catalog, id) {
    const normalized = normalizeId(id);
    return catalog.find(item => normalizeId(item.id) === normalized) || null;
}

module.exports = {
    buildConstructorFeedback,
    buildDriverFeedback,
    buildTrackFeedback,
    clone,
    createSeededRandom,
    filterDriversByDifficulty,
    filterDriversByEra,
    findEra,
    getTargetById,
    normalizeDriver,
    normalizeDrivers,
    normalizeId,
    normalizeString,
    publicConstructor,
    publicDriver,
    publicTrack,
    sampleUnique,
    shuffle
};
