'use strict';

const { shuffle } = require('./extendedModesModel');

const SUDOKU_ROW_CRITERIA = Object.freeze([
    { id: 'team-ferrari', label: 'A concurat pentru Ferrari', type: 'team', value: 'Ferrari' },
    { id: 'team-mclaren', label: 'A concurat pentru McLaren', type: 'team', value: 'McLaren' },
    { id: 'team-williams', label: 'A concurat pentru Williams', type: 'team', value: 'Williams' },
    { id: 'team-mercedes', label: 'A concurat pentru Mercedes', type: 'team', value: 'Mercedes' },
    { id: 'team-red-bull', label: 'A concurat pentru Red Bull', type: 'team', value: 'Red Bull' },
    { id: 'team-renault', label: 'A concurat pentru Renault', type: 'team', value: 'Renault' }
]);

const SUDOKU_COLUMN_CRITERIA = Object.freeze([
    { id: 'nat-gbr', label: 'Naționalitate GBR', type: 'nat', value: 'GBR' },
    { id: 'nat-ger', label: 'Naționalitate GER', type: 'nat', value: 'GER' },
    { id: 'nat-fra', label: 'Naționalitate FRA', type: 'nat', value: 'FRA' },
    { id: 'wins-10', label: 'Cel puțin 10 victorii', type: 'wins-min', value: 10 },
    { id: 'wins-1', label: 'Cel puțin o victorie', type: 'wins-min', value: 1 },
    { id: 'debut-before-2000', label: 'Debut înainte de 2000', type: 'debut-max', value: 1999 },
    { id: 'debut-2010-plus', label: 'Debut din 2010', type: 'debut-min', value: 2010 }
]);

function matchesSudokuCriterion(driver, criterion) {
    if (!driver || !criterion) return false;
    switch (criterion.type) {
        case 'team':
            return driver.team.includes(criterion.value);
        case 'nat':
            return driver.nat === criterion.value;
        case 'wins-min':
            return driver.wins >= criterion.value;
        case 'debut-max':
            return driver.debut <= criterion.value;
        case 'debut-min':
            return driver.debut >= criterion.value;
        default:
            return false;
    }
}

function buildSudokuCandidates(drivers, rows, columns) {
    return Array.from({ length: 9 }, (_, cellIndex) => {
        const rowIndex = Math.floor(cellIndex / 3);
        const columnIndex = cellIndex % 3;
        return drivers.filter(driver => (
            matchesSudokuCriterion(driver, rows[rowIndex])
            && matchesSudokuCriterion(driver, columns[columnIndex])
        ));
    });
}

function findDistinctSudokuSolution(candidateLists, random = Math.random) {
    const assignments = Array(9).fill(null);
    const used = new Set();

    function solve(remainingIndices) {
        if (remainingIndices.length === 0) return true;
        const sorted = [...remainingIndices].sort((left, right) => {
            const leftCount = candidateLists[left].filter(candidate => !used.has(candidate.id)).length;
            const rightCount = candidateLists[right].filter(candidate => !used.has(candidate.id)).length;
            return leftCount - rightCount;
        });
        const cellIndex = sorted[0];
        const nextRemaining = remainingIndices.filter(index => index !== cellIndex);
        const candidates = shuffle(candidateLists[cellIndex], random).filter(candidate => !used.has(candidate.id));
        for (const candidate of candidates) {
            assignments[cellIndex] = candidate;
            used.add(candidate.id);
            if (solve(nextRemaining)) return true;
            used.delete(candidate.id);
            assignments[cellIndex] = null;
        }
        return false;
    }

    return solve([...Array(9).keys()]) ? assignments : null;
}

function createSudokuPuzzle(drivers, random = Math.random) {
    const rowCombos = shuffle(SUDOKU_ROW_CRITERIA, random);
    const columnCombos = shuffle(SUDOKU_COLUMN_CRITERIA, random);

    for (let rowStart = 0; rowStart <= rowCombos.length - 3; rowStart++) {
        const rows = rowCombos.slice(rowStart, rowStart + 3);
        for (let columnStart = 0; columnStart <= columnCombos.length - 3; columnStart++) {
            const columns = columnCombos.slice(columnStart, columnStart + 3);
            const candidates = buildSudokuCandidates(drivers, rows, columns);
            if (candidates.some(list => list.length === 0)) continue;
            const solution = findDistinctSudokuSolution(candidates, random);
            if (solution) {
                return {
                    rows: rows.map(criterion => ({ ...criterion })),
                    columns: columns.map(criterion => ({ ...criterion })),
                    candidates,
                    solution
                };
            }
        }
    }

    throw new Error('Nu există suficiente combinații distincte pentru Pilot Sudoku.');
}

module.exports = {
    SUDOKU_COLUMN_CRITERIA,
    SUDOKU_ROW_CRITERIA,
    buildSudokuCandidates,
    createSudokuPuzzle,
    findDistinctSudokuSolution,
    matchesSudokuCriterion
};
