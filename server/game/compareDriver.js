function getCurrentTeam(driver) {
    return Array.isArray(driver.team) ? driver.team[0] : driver.team;
}

function compareGuess(guessDriver, target) {
    const currentGuessTeam = getCurrentTeam(guessDriver);

    const results = {
        name: guessDriver.id === target.id ? 'green' : 'red',
        nat: guessDriver.nat === target.nat ? 'green' : 'red',
        team: 'red',
        age: target.age > guessDriver.age ? 'orange' : (target.age < guessDriver.age ? 'purple' : 'green'),
        debut: target.debut > guessDriver.debut ? 'orange' : (target.debut < guessDriver.debut ? 'purple' : 'green'),
        wins: target.wins > guessDriver.wins ? 'orange' : (target.wins < guessDriver.wins ? 'purple' : 'green')
    };

    if (Array.isArray(target.team) && target.team.includes(currentGuessTeam)) {
        results.team = currentGuessTeam === target.team[0] ? 'green' : 'yellow';
    }

    return results;
}

module.exports = {
    getCurrentTeam,
    compareGuess
};
