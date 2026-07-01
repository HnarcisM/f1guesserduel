const fs = require('fs');
const path = require('path');
const { isValidDifficulty } = require('../config/constants');

function loadDriversFromFile(filePath) {
    const data = fs.readFileSync(filePath, 'utf8');
    const cleanData = data.replace(/\/\*[\s\S]*?\*\//g, '');
    const drivers = JSON.parse(cleanData);

    if (!Array.isArray(drivers) || drivers.length === 0) {
        throw new Error('drivers.json nu conține o listă validă de piloți.');
    }

    return drivers;
}

function createDriversRepository(options = {}) {
    const driversFilePath = options.driversFilePath || path.join(__dirname, '..', '..', 'data', 'drivers.json');
    const allDrivers = loadDriversFromFile(driversFilePath);

    function getAllDrivers() {
        return allDrivers;
    }

    function getDriversByDifficulty(difficulty) {
        if (!isValidDifficulty(difficulty)) return [];
        if (difficulty === 'all') return allDrivers;
        return allDrivers.filter(driver => driver.difficulty === difficulty);
    }

    return {
        getAllDrivers,
        getDriversByDifficulty
    };
}

module.exports = {
    createDriversRepository,
    loadDriversFromFile
};
