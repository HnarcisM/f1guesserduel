'use strict';

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

/*
 * Curated gameplay catalog. Statistics are intentionally versioned through the
 * end of the 2025 season so future updates can change data without changing the
 * rules engine.
 */
const CONSTRUCTOR_CATALOG_VERSION = '2025-final';
const CONSTRUCTORS = deepFreeze([
    { id: 'ferrari', name: 'Ferrari', country: 'ITA', debut: 1950, championships: 16, active: true, era: 'all-time' },
    { id: 'mclaren', name: 'McLaren', country: 'GBR', debut: 1966, championships: 10, active: true, era: 'all-time' },
    { id: 'mercedes', name: 'Mercedes', country: 'GER', debut: 1954, championships: 8, active: true, era: 'modern' },
    { id: 'red-bull', name: 'Red Bull', country: 'AUT', debut: 2005, championships: 6, active: true, era: 'modern' },
    { id: 'williams', name: 'Williams', country: 'GBR', debut: 1977, championships: 9, active: true, era: 'classic' },
    { id: 'renault', name: 'Renault', country: 'FRA', debut: 1977, championships: 2, active: false, era: 'modern' },
    { id: 'lotus', name: 'Lotus', country: 'GBR', debut: 1958, championships: 7, active: false, era: 'classic' },
    { id: 'brabham', name: 'Brabham', country: 'GBR', debut: 1962, championships: 2, active: false, era: 'classic' },
    { id: 'benetton', name: 'Benetton', country: 'ITA', debut: 1986, championships: 1, active: false, era: 'classic' },
    { id: 'brawn', name: 'Brawn GP', country: 'GBR', debut: 2009, championships: 1, active: false, era: 'modern' },
    { id: 'tyrrell', name: 'Tyrrell', country: 'GBR', debut: 1970, championships: 1, active: false, era: 'classic' },
    { id: 'alpine', name: 'Alpine', country: 'FRA', debut: 2021, championships: 0, active: true, era: 'current' },
    { id: 'aston-martin', name: 'Aston Martin', country: 'GBR', debut: 1959, championships: 0, active: true, era: 'current' },
    { id: 'sauber', name: 'Sauber', country: 'SUI', debut: 1993, championships: 0, active: false, era: 'modern' },
    { id: 'haas', name: 'Haas', country: 'USA', debut: 2016, championships: 0, active: true, era: 'current' },
    { id: 'toro-rosso', name: 'Toro Rosso', country: 'ITA', debut: 2006, championships: 0, active: false, era: 'modern' },
    { id: 'jordan', name: 'Jordan', country: 'IRL', debut: 1991, championships: 0, active: false, era: 'modern' },
    { id: 'minardi', name: 'Minardi', country: 'ITA', debut: 1985, championships: 0, active: false, era: 'classic' }
]);

const TRACK_CATALOG_VERSION = '2026-layout-v1';
const TRACKS = deepFreeze([
    {
        id: 'monza', name: 'Monza', country: 'ITA', firstGrandPrix: 1950,
        lengthKm: 5.793, corners: 11, direction: 'clockwise',
        layout: [[8,55],[22,55],[25,50],[27,24],[34,12],[43,13],[48,22],[50,46],[58,50],[72,42],[85,44],[92,56],[89,67],[75,70],[58,66],[42,70],[28,67],[15,63],[8,55]]
    },
    {
        id: 'monaco', name: 'Monaco', country: 'MON', firstGrandPrix: 1950,
        lengthKm: 3.337, corners: 19, direction: 'clockwise',
        layout: [[12,58],[16,44],[24,32],[33,24],[47,20],[58,26],[61,38],[53,44],[43,42],[39,50],[46,57],[60,58],[72,50],[84,53],[88,63],[81,72],[65,76],[51,71],[39,65],[28,69],[18,66],[12,58]]
    },
    {
        id: 'silverstone', name: 'Silverstone', country: 'GBR', firstGrandPrix: 1950,
        lengthKm: 5.891, corners: 18, direction: 'clockwise',
        layout: [[10,55],[19,42],[34,36],[48,37],[56,28],[67,28],[77,36],[90,34],[87,47],[72,54],[74,66],[62,75],[50,69],[38,74],[24,69],[16,63],[10,55]]
    },
    {
        id: 'spa', name: 'Spa-Francorchamps', country: 'BEL', firstGrandPrix: 1950,
        lengthKm: 7.004, corners: 19, direction: 'clockwise',
        layout: [[9,66],[16,52],[22,39],[31,23],[44,13],[56,17],[61,31],[71,35],[82,28],[91,36],[86,51],[74,58],[64,72],[50,78],[35,73],[25,64],[18,70],[9,66]]
    },
    {
        id: 'suzuka', name: 'Suzuka', country: 'JPN', firstGrandPrix: 1987,
        lengthKm: 5.807, corners: 18, direction: 'clockwise',
        layout: [[8,52],[18,42],[31,39],[43,45],[55,55],[67,62],[80,57],[90,47],[83,38],[70,35],[59,42],[48,52],[38,62],[25,66],[15,61],[8,52],[22,50],[40,48],[58,48],[75,51]]
    },
    {
        id: 'interlagos', name: 'Interlagos', country: 'BRA', firstGrandPrix: 1973,
        lengthKm: 4.309, corners: 15, direction: 'counter-clockwise',
        layout: [[13,43],[24,31],[39,27],[54,32],[66,43],[80,48],[90,59],[82,70],[66,73],[55,64],[48,52],[34,48],[24,57],[15,55],[13,43]]
    },
    {
        id: 'melbourne', name: 'Albert Park', country: 'AUS', firstGrandPrix: 1996,
        lengthKm: 5.278, corners: 14, direction: 'clockwise',
        layout: [[10,58],[18,39],[31,25],[48,20],[65,24],[80,34],[90,49],[84,63],[72,72],[56,76],[42,69],[31,58],[19,66],[10,58]]
    },
    {
        id: 'bahrain', name: 'Bahrain International Circuit', country: 'BHR', firstGrandPrix: 2004,
        lengthKm: 5.412, corners: 15, direction: 'clockwise',
        layout: [[12,62],[21,45],[34,37],[48,39],[60,28],[73,30],[87,42],[83,54],[70,58],[76,70],[62,76],[49,65],[35,70],[23,65],[12,62]]
    },
    {
        id: 'jeddah', name: 'Jeddah Corniche Circuit', country: 'KSA', firstGrandPrix: 2021,
        lengthKm: 6.174, corners: 27, direction: 'counter-clockwise',
        layout: [[12,72],[18,62],[24,50],[31,38],[39,27],[48,18],[58,15],[69,22],[77,35],[83,49],[89,61],[85,72],[72,77],[57,75],[41,72],[26,75],[12,72]]
    },
    {
        id: 'imola', name: 'Imola', country: 'ITA', firstGrandPrix: 1980,
        lengthKm: 4.909, corners: 19, direction: 'counter-clockwise',
        layout: [[10,56],[17,43],[30,35],[42,28],[55,31],[64,42],[77,38],[89,46],[84,58],[72,65],[61,76],[46,72],[34,63],[22,67],[13,62],[10,56]]
    },
    {
        id: 'barcelona', name: 'Circuit de Barcelona-Catalunya', country: 'ESP', firstGrandPrix: 1991,
        lengthKm: 4.657, corners: 14, direction: 'clockwise',
        layout: [[11,61],[20,43],[34,32],[48,28],[61,31],[74,27],[89,35],[86,49],[76,55],[66,69],[50,74],[37,67],[26,72],[15,68],[11,61]]
    },
    {
        id: 'red-bull-ring', name: 'Red Bull Ring', country: 'AUT', firstGrandPrix: 1970,
        lengthKm: 4.318, corners: 10, direction: 'clockwise',
        layout: [[13,63],[21,43],[34,27],[49,20],[66,24],[83,34],[89,48],[79,60],[63,70],[47,73],[31,68],[18,72],[13,63]]
    },
    {
        id: 'hungaroring', name: 'Hungaroring', country: 'HUN', firstGrandPrix: 1986,
        lengthKm: 4.381, corners: 14, direction: 'clockwise',
        layout: [[12,58],[20,40],[32,30],[46,28],[58,35],[69,27],[84,34],[90,48],[83,59],[71,66],[61,77],[45,73],[36,62],[23,67],[12,58]]
    },
    {
        id: 'zandvoort', name: 'Zandvoort', country: 'NED', firstGrandPrix: 1952,
        lengthKm: 4.259, corners: 14, direction: 'clockwise',
        layout: [[11,51],[21,35],[35,26],[50,28],[64,20],[79,28],[88,41],[84,54],[75,65],[61,70],[48,78],[35,69],[22,65],[14,60],[11,51]]
    },
    {
        id: 'singapore', name: 'Marina Bay', country: 'SGP', firstGrandPrix: 2008,
        lengthKm: 4.940, corners: 19, direction: 'counter-clockwise',
        layout: [[10,67],[16,50],[25,44],[25,31],[39,25],[52,31],[61,23],[75,27],[87,39],[82,50],[91,61],[82,72],[66,70],[56,79],[41,73],[29,77],[18,72],[10,67]]
    },
    {
        id: 'austin', name: 'Circuit of the Americas', country: 'USA', firstGrandPrix: 2012,
        lengthKm: 5.513, corners: 20, direction: 'counter-clockwise',
        layout: [[11,61],[18,42],[26,25],[39,21],[52,31],[63,25],[77,28],[89,40],[83,53],[71,57],[75,70],[61,76],[48,68],[35,75],[22,70],[11,61]]
    },
    {
        id: 'mexico', name: 'Autódromo Hermanos Rodríguez', country: 'MEX', firstGrandPrix: 1963,
        lengthKm: 4.304, corners: 17, direction: 'clockwise',
        layout: [[10,58],[20,38],[35,30],[51,31],[63,22],[77,27],[90,38],[86,53],[77,63],[64,59],[55,71],[41,76],[28,70],[17,66],[10,58]]
    },
    {
        id: 'las-vegas', name: 'Las Vegas Strip Circuit', country: 'USA', firstGrandPrix: 2023,
        lengthKm: 6.201, corners: 17, direction: 'counter-clockwise',
        layout: [[12,72],[18,58],[22,38],[29,24],[44,20],[60,22],[74,19],[87,29],[91,45],[87,63],[76,69],[61,71],[46,68],[31,75],[12,72]]
    },
    {
        id: 'qatar', name: 'Lusail International Circuit', country: 'QAT', firstGrandPrix: 2021,
        lengthKm: 5.419, corners: 16, direction: 'clockwise',
        layout: [[12,57],[19,39],[31,27],[47,22],[62,27],[76,24],[88,36],[91,50],[83,64],[69,72],[54,75],[41,69],[28,74],[17,67],[12,57]]
    },
    {
        id: 'abu-dhabi', name: 'Yas Marina', country: 'UAE', firstGrandPrix: 2009,
        lengthKm: 5.281, corners: 16, direction: 'counter-clockwise',
        layout: [[11,63],[18,44],[31,32],[46,29],[60,33],[70,23],[84,29],[90,44],[84,58],[72,61],[68,73],[53,76],[39,69],[25,73],[14,68],[11,63]]
    }
]);

module.exports = {
    CONSTRUCTOR_CATALOG_VERSION,
    CONSTRUCTORS,
    TRACK_CATALOG_VERSION,
    TRACKS,
    deepFreeze
};
