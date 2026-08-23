'use strict';

const EXTENDED_VARIANTS = Object.freeze({
    SPEED_RUN: 'speed-run',
    ERA: 'era',
    STREAK: 'streak',
    WEEKLY: 'weekly',
    CONSTRUCTOR: 'constructor',
    PILOT_SUDOKU: 'pilot-sudoku',
    TRACK: 'track'
});

const EXTENDED_VARIANT_KEYS = Object.freeze(Object.values(EXTENDED_VARIANTS));
const MAX_DRIVER_ATTEMPTS = 6;
const STREAK_ATTEMPTS = 3;
const SPEED_RUN_ROUNDS = 5;
const SPEED_RUN_SECONDS = 90;
const WEEKLY_ROUNDS = 5;
const WEEKLY_SECONDS = 120;
const SKIP_PENALTY = 250;

const ERA_FILTERS = Object.freeze([
    Object.freeze({ key: 'pioneers', title: 'Pioneers', description: 'Debut înainte de 1970', from: 0, to: 1969 }),
    Object.freeze({ key: 'classic', title: 'Classic', description: 'Debut între 1970 și 1989', from: 1970, to: 1989 }),
    Object.freeze({ key: 'modern', title: 'Modern', description: 'Debut între 1990 și 2009', from: 1990, to: 2009 }),
    Object.freeze({ key: 'hybrid', title: 'Hybrid', description: 'Debut între 2010 și 2019', from: 2010, to: 2019 }),
    Object.freeze({ key: 'current', title: 'Current', description: 'Debut din 2020', from: 2020, to: Number.POSITIVE_INFINITY })
]);

module.exports = {
    ERA_FILTERS,
    EXTENDED_VARIANTS,
    EXTENDED_VARIANT_KEYS,
    MAX_DRIVER_ATTEMPTS,
    SKIP_PENALTY,
    SPEED_RUN_ROUNDS,
    SPEED_RUN_SECONDS,
    STREAK_ATTEMPTS,
    WEEKLY_ROUNDS,
    WEEKLY_SECONDS
};
