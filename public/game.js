/**
 * F1 Guesser Duel - client-side application logic.
 *
 * Responsabilități principale:
 * - inițializează conexiunea Socket.IO cu serverul;
 * - gestionează camera de duel și dificultatea selectată;
 * - afișează autocomplete-ul pentru piloți;
 * - trimite ghicirile către server;
 * - randează rezultatele primite de la server în grid;
 * - salvează și afișează statisticile locale în browser;
 * - gestionează tema vizuală, share link și restart.
 *
 * Notă de arhitectură:
 * Clientul afișează UI-ul, dar validarea rezultatului se face pe server.
 * Astfel, pilotul țintă nu este dezvăluit în browser până la finalul jocului.
 */

// ===============================
// Global state
// ===============================
// Conexiunea Socket.IO este inițializată la DOMContentLoaded.
let socket;
// Lista de piloți disponibilă pentru dificultatea curentă, primită de la server.
let driversList = [];
// ID-ul pilotului ales din autocomplete; evită ambiguități între nume similare.
let selectedDriverId = null;
// Indexul sugestiei active când utilizatorul navighează cu săgețile.
let currentFocus = -1;
// Starea finalului de rundă: devine true după câștig/pierdere/timer expirat.
let isRoundFinished = false;
// Dacă popup-ul final este închis fără restart, butonul Trimite intră în mod Rematch.
let isRematchMode = false;
// Preferința locală pentru rundele cu timp. Se aplică la următoarea dificultate/restart.
let isTimedModeEnabled = localStorage.getItem('f1-guesser-timed-mode') === 'on';
let selectedTimeLimitSeconds = Number(localStorage.getItem('f1-guesser-time-limit')) || 60;
let currentRoundTimed = false;
let currentTimeLimitSeconds = 60;
let roundTimerInterval = null;
let roundTimerEndsAt = null;

// ===============================
// Constants
// ===============================
// Mapare coduri FIA/F1 către coduri ISO folosite de fișierele SVG din /flags.
const F1_TO_ISO = {
	"ARG": "ar", "AUS": "au", "AUT": "at", "BEL": "be", "BRA": "br",
	"CAN": "ca", "CHN": "cn", "COL": "co", "CZE": "cz", "DEN": "dk",
	"ESP": "es", "SPA": "es", "FIN": "fi", "FRA": "fr", "GBR": "gb",
	"GER": "de", "HUN": "hu", "IND": "in", "ITA": "it", "JPN": "jp",
	"MAS": "my", "MEX": "mx", "MON": "mc", "NED": "nl", "NZL": "nz",
	"POL": "pl", "POR": "pt", "RSA": "za", "RUS": "ru", "SUI": "ch",
	"SWE": "se", "THA": "th", "USA": "us", "VEN": "ve",
	"UAE": "ae", "CHI": "cl", "URU": "uy", "BUL": "bg", "CRO": "hr"
};

// Mapare nume echipă normalizat -> fișier logo local.
// Folosim această listă pentru a evita request-uri inutile către extensii greșite.
const TEAM_LOGO_FILES = {
	"alfaromeo": "AlfaRomeo.svg",
	"alphatauri": "AlphaTauri.svg",
	"alpine": "Alpine.svg",
	"arrows": "Arrows.svg",
	"astonmartin": "AstonMartin.svg",
	"audi": "Audi.svg",
	"bar": "BAR.png",
	"benetton": "Benetton.png",
	"brabham": "Brabham.png",
	"brawn": "BrawnGP.jpg",
	"brawngp": "BrawnGP.jpg",
	"caterham": "Caterham.svg",
	"f1": "F1.svg",
	"ferrari": "Ferrari.png",
	"footwork": "Footwork.png",
	"forceindia": "Forceindia.png",
	"haas": "Haas.svg",
	"honda": "Honda.png",
	"jaguar": "Jaguar.png",
	"jordan": "Jordan.png",
	"lancia": "Lancia.png",
	"ligier": "Ligier.png",
	"lotus": "Lotus.png",
	"manor": "Manor.png",
	"march": "March.png",
	"marussia": "Marussia.png",
	"mclaren": "McLaren.svg",
	"mercedes": "Mercedes.svg",
	"minardi": "Minardi.svg",
	"penske": "Penske.svg",
	"prost": "Prost.png",
	"racingpoint": "RacingPoint.svg",
	"rb": "racingbulls.png",
	"racingbulls": "racingbulls.png",
	"redbull": "RedBull.png",
	"renault": "Renault.png",
	"sauber": "Stake.png",
	"stake": "Stake.png",
	"shadow": "Shadow.png",
	"spyker": "Spyker.jpg",
	"stewart": "Stewart.png",
	"superaguri": "SuperAguri.svg",
	"tororosso": "ToroRosso.png",
	"toyota": "Toyota.png",
	"tyrrell": "Tyrrell.svg",
	"williams": "Williams.png",
	"wolf": "Wolf.png"
};

const DEFAULT_TIME_LIMIT_SECONDS = 60;
const ALLOWED_TIME_LIMIT_SECONDS = [60, 90, 120];

/** Normalizează durata timerului la una dintre opțiunile suportate. */
function normalizeTimeLimitSeconds(value) {
	const seconds = Number(value);
	return ALLOWED_TIME_LIMIT_SECONDS.includes(seconds) ? seconds : DEFAULT_TIME_LIMIT_SECONDS;
}

// ===============================
// Small DOM utilities
// ===============================
/**
 * Creează un element text sigur.
 * Folosește textContent, nu innerHTML, pentru a evita inserarea de HTML nedorit.
 */
function createTextElement(tagName, className, text) {
	const element = document.createElement(tagName);
	if (className) element.className = className;
	element.textContent = text;
	return element;
}

/**
 * Setează rapid textul unui element căutat după ID, doar dacă elementul există.
 */
function setTextContentById(elementId, value) {
	const element = document.getElementById(elementId);
	if (element) element.textContent = value;
}

// ===============================
// Grid initialization
// ===============================
/**
 * Construiește gridul principal al jocului: header + 6 rânduri x 6 coloane.
 * Se apelează la începutul jocului și după restart.
 */
function initializeGridStructure() {
	const grid = document.getElementById("grid");
	if (!grid) return;
	let html = `
		<div class="cell header attempt-header">#</div>
		<div class="cell header">PILOT</div><div class="cell header">ȚARĂ</div><div class="cell header">ECHIPĂ</div>
		<div class="cell header">VÂRSTĂ</div><div class="cell header">DEBUT</div><div class="cell header">WINS</div>
	`;
	for (let row = 0; row < 6; row++) {
		// Prima celulă din fiecare rând indică numărul încercării.
		// Celulele de rezultat rămân indexate 0-5, deci logica jocului nu se schimbă.
		html += `<div class="cell attempt-index" id="attempt-${row}" aria-label="Încercarea ${row + 1}">${row + 1}</div>`;
		for (let col = 0; col < 6; col++) {
			html += `<div class="cell" id="cell-${row}-${col}"></div>`;
		}
	}
	grid.innerHTML = html;
}

// ===============================
// Autocomplete
// ===============================
/** Returnează containerul listei de autocomplete. */
function getSuggestionsContainer() {
	return document.getElementById("suggestions");
}

/** Returnează elementele <li> din autocomplete, sau null dacă lista nu există. */
function getSuggestionItems() {
	const suggestions = getSuggestionsContainer();
	return suggestions ? suggestions.getElementsByTagName("li") : null;
}

/**
 * Golește lista de sugestii și resetează navigarea cu tastatura.
 */
function clearSuggestions() {
	const suggestions = getSuggestionsContainer();
	if (suggestions) suggestions.replaceChildren();
	currentFocus = -1;
}

/**
 * Punctul de intrare pentru autocomplete când utilizatorul scrie în input.
 */
function showPredictions(value) {
	selectedDriverId = null;
	currentFocus = -1;
	renderSuggestions(filterDriverPredictions(value));
}

/**
 * Filtrează piloții după începutul prenumelui sau numelui.
 * Exemplu: "ham" va găsi "Lewis Hamilton".
 */
function filterDriverPredictions(value) {
	const query = value.trim().toLowerCase();
	if (!query) return [];

	return driversList.filter(driver => {
		const nameParts = driver.name.toLowerCase().split(" ");
		return nameParts.some(part => part.startsWith(query));
	});
}

/**
 * Randează sugestiile în listă folosind elemente DOM reale, nu HTML string.
 */
function renderSuggestions(drivers) {
	const listContainer = getSuggestionsContainer();
	if (!listContainer) return;

	listContainer.replaceChildren();
	drivers.forEach(driver => {
		listContainer.appendChild(createSuggestionItem(driver));
	});
}

/**
 * Creează o sugestie individuală. Click-ul pe sugestie selectează pilotul și trimite ghicirea.
 */
function createSuggestionItem(driver) {
	const li = document.createElement("li");
	li.textContent = driver.name;
	li.dataset.id = driver.id;
	li.addEventListener("click", () => selectDriverSuggestion(driver));
	return li;
}

/** Selectează un pilot dintr-un obiect driver primit din lista filtrată. */
function selectDriverSuggestion(driver) {
	const inputEl = document.getElementById("driverInput");
	if (inputEl) inputEl.value = driver.name;
	selectedDriverId = driver.id;
	clearSuggestions();
	sendGuess();
}

/** Selectează un pilot pornind de la elementul <li> activ în autocomplete. */
function selectSuggestionItem(item) {
	if (!item) return;
	const inputEl = document.getElementById("driverInput");
	if (inputEl) inputEl.value = item.textContent;
	selectedDriverId = item.dataset.id;
	clearSuggestions();
	sendGuess();
}

/**
 * Gestionează navigarea în autocomplete cu ArrowUp / ArrowDown / Enter.
 */
function handleAutocompleteKeydown(e) {
	const list = getSuggestionItems();

	if (e.key === "ArrowDown") {
		currentFocus++;
		addActive(list);
	} else if (e.key === "ArrowUp") {
		currentFocus--;
		addActive(list);
	} else if (e.key === "Enter") {
		e.preventDefault();
		if (currentFocus > -1 && list && list[currentFocus]) {
			selectSuggestionItem(list[currentFocus]);
		} else {
			sendGuess();
		}
	}
}

/** Marchează vizual sugestia activă și se asigură că rămâne vizibilă în listă. */
function addActive(list) {
	if (!list || list.length === 0) return;
	removeActive(list);
	if (currentFocus >= list.length) currentFocus = 0;
	if (currentFocus < 0) currentFocus = (list.length - 1);
	list[currentFocus].classList.add("active");
	list[currentFocus].scrollIntoView({ block: "nearest" });
}

/** Elimină clasa active de pe toate sugestiile. */
function removeActive(list) {
	for (let i = 0; i < list.length; i++) {
		list[i].classList.remove("active");
	}
}

// ===============================
// Guess submission
// ===============================
/**
 * Validează inputul curent și trimite ID-ul pilotului către server.
 * Serverul decide dacă ghicirea este corectă și trimite înapoi culorile celulelor.
 */
function sendGuess() {
	if (isRematchMode) {
		requestRematch();
		return;
	}

	if (isRoundFinished) return;

	const inputEl = document.getElementById("driverInput");
	if (!inputEl) return;
	const inputVal = inputEl.value.trim();
	let finalDriver = driversList.find(d => d.id === selectedDriverId || d.name.toLowerCase() === inputVal.toLowerCase());
	if (!finalDriver) {
		alert("Te rog selectează un pilot valid din lista de predicții!");
		return;
	}

	if (socket) {
		socket.emit('submitGuess', finalDriver.id);
	}
	inputEl.value = "";
	clearSuggestions();
	selectedDriverId = null;
}

// ===============================
// Asset helpers: flags and team logos
// ===============================
/** Transformă codul de naționalitate F1/FIA în cod ISO pentru fișierul SVG local. */
function getIsoCode(nationality) {
	if (!nationality) return "un";
	return F1_TO_ISO[nationality.toUpperCase()] || nationality.substring(0, 2).toLowerCase();
}

/** Normalizează numele echipei pentru a-l putea căuta în TEAM_LOGO_FILES. */
function normalizeTeamLogoKey(teamName) {
	return String(teamName || '')
		.replace(/\s+/g, '')
		.toLowerCase();
}

/** Returnează calea către logo-ul local al echipei, dacă există în mapare. */
function getLocalTeamLogoPath(teamName) {
	const fileName = TEAM_LOGO_FILES[normalizeTeamLogoKey(teamName)];
	return fileName ? `/logos/${fileName}` : null;
}

/**
 * Fallback pentru logo-uri de echipe.
 * Ordine: fișier local -> logo online cunoscut -> logo generic F1.
 */
function handleTeamLogoError(imgElement, teamName, currentStep) {
	const onlineLogos = {
		"Ferrari": "https://upload.wikimedia.org/wikipedia/sco/d/d4/Ferrari-Logo.svg",
		"Mercedes": "https://upload.wikimedia.org/wikipedia/commons/9/90/Mercedes-Logo.svg",
		"Red Bull": "https://upload.wikimedia.org/wikipedia/en/b/b5/Red_Bull_Racing_logo.svg",
		"McLaren": "https://upload.wikimedia.org/wikipedia/en/6/66/McLaren_Racing_logo.svg",
		"Alpine": "https://upload.wikimedia.org/wikipedia/commons/7/7e/Alpine_F1_Team_Logo.svg",
		"Aston Martin": "https://upload.wikimedia.org/wikipedia/commons/2/2b/Aston_Martin_Lagonda_brand_logo.svg",
		"Williams": "https://upload.wikimedia.org/wikipedia/commons/6/6d/Williams_Racing_2020_Logo.svg",
		"AlphaTauri": "https://upload.wikimedia.org/wikipedia/commons/e/e4/Scuderia_AlphaTauri_logo.svg",
		"Haas": "https://upload.wikimedia.org/wikipedia/commons/e/e2/Haas_F1_Team_logo.svg",
		"Alfa Romeo": "https://upload.wikimedia.org/wikipedia/commons/2/26/Alfa_Romeo_F1_Team_Orlen_logo.svg",
		"Sauber": "https://upload.wikimedia.org/wikipedia/commons/c/cc/Stake_F1_Team_Kick_Sauber_logo.svg",
		"Renault": "https://upload.wikimedia.org/wikipedia/commons/b/b1/Renault_2021.svg",
		"Racing Point": "https://upload.wikimedia.org/wikipedia/commons/e/e2/Racing_Point_F1_logo.svg",
		"Force India": "https://upload.wikimedia.org/wikipedia/en/a/a2/Sahara_Force_India_F1_Team_logo.svg",
		"Toro Rosso": "https://upload.wikimedia.org/wikipedia/en/3/3d/Scuderia_Toro_Rosso_logo.svg",
		"Lotus": "https://upload.wikimedia.org/wikipedia/commons/c/cf/Lotus_F1_Team_logo.svg"
	};

	const onlineLogo = onlineLogos[teamName];

	if (currentStep === 0 && onlineLogo) {
		imgElement.onerror = () => handleTeamLogoError(imgElement, teamName, 1);
		imgElement.src = onlineLogo;
		return;
	}

	imgElement.onerror = null;
	imgElement.src = "/logos/F1.svg";
}

/**
 * Fallback pentru steaguri.
 * Ordine: SVG local -> FlagCDN PNG -> steag generic UN.
 */
function handleFlagError(imgElement, isoCode, currentStep) {
	if (currentStep === 0) {
		imgElement.onerror = () => handleFlagError(imgElement, isoCode, 1);
		imgElement.src = `https://flagcdn.com/w160/${isoCode}.png`;
		return;
	}

	imgElement.onerror = null;
	imgElement.src = "/flags/un.svg";
}

/**
 * Generează emoji de steag din cod de țară.
 * Momentan este păstrată ca utilitar fallback, chiar dacă UI-ul principal folosește imagini SVG.
 */
function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 3) return "🏳️";
    
    // Dicționar pentru excepțiile specifice din F1 (unde codurile FIA diferă de codurile standard de țară ISO)
    const f1Exceptions = {
        "GBR": "GB", // Marea Britanie
        "GER": "DE", // Germania
        "NED": "NL", // Olanda
        "SUI": "CH", // Elveția
        "SPA": "ES", // Spania
        "RSA": "ZA", // Africa de Sud
        "MAS": "MY", // Malaezia
        "MON": "MC", // Monaco
        "UAE": "AE", // Emiratele Arabe Unite
        "CHI": "CL", // Chile
        "URU": "UY", // Uruguay
        "DEN": "DK", // Danemarca
        "POR": "PT", // Portugalia
        "THA": "TH", // Thailanda
        "MEX": "MX", // Mexic
        "BUL": "BG", // Bulgaria
        "CRO": "HR", // Croația
    };

    let code = f1Exceptions[countryCode.toUpperCase()] || countryCode.substring(0, 2).toUpperCase();
    
    try {
        return code.toUpperCase().replace(/./g, char => 
            String.fromCodePoint(char.charCodeAt(0) + 127397)
        );
    } catch (e) {
        return "🏳️";
    }
}

// ===============================
// Result cell rendering
// ===============================
/**
 * Resetează conținutul unei celule și aplică clasele CSS care indică starea rezultatului.
 */
function setCellState(cell, resultClass, extraClasses = []) {
	if (!cell) return;
	cell.className = ["cell", "cell-reveal", resultClass, ...extraClasses].filter(Boolean).join(" ");
	cell.replaceChildren();
}

/** Randează celula cu ID-ul și numele pilotului ghicit. */
function renderDriverCell(cell, guess, resultClass) {
	setCellState(cell, resultClass, ["cell-driver"]);
	cell.append(
		createTextElement("span", "cell-driver-id", guess.id),
		createTextElement("span", "cell-driver-name", guess.name)
	);
}

/** Randează celula de țară: steag local + cod naționalitate. */
function renderCountryCell(cell, guess, resultClass) {
	setCellState(cell, resultClass, ["cell-media", "cell-country"]);

	const isoCode = getIsoCode(guess.nat);
	const flag = document.createElement("img");
	flag.className = "cell-country-flag";
	flag.src = `/flags/${isoCode}.svg`;
	flag.alt = guess.nat;
	flag.onerror = () => handleFlagError(flag, isoCode, 0);

	cell.append(
		flag,
		createTextElement("span", "cell-media-label", guess.nat)
	);
}

/** Randează celula de echipă: logo + nume scurt. */
function renderTeamCell(cell, guess, resultClass) {
	setCellState(cell, resultClass, ["cell-media", "cell-team"]);

	const currentGuessTeam = guess.team[0];
	const logo = document.createElement("img");
	logo.className = "cell-team-logo";
	logo.src = getLocalTeamLogoPath(currentGuessTeam) || "/logos/F1.svg";
	logo.alt = currentGuessTeam;
	logo.onerror = () => handleTeamLogoError(logo, currentGuessTeam, 0);

	cell.append(
		logo,
		createTextElement("span", "cell-media-label", currentGuessTeam.substring(0, 5))
	);
}

/**
 * Pentru valorile numerice, întoarce săgeata care indică direcția valorii corecte.
 * orange = valoarea corectă este mai mare; purple = valoarea corectă este mai mică.
 */
function getArrowSymbol(resultClass) {
	if (resultClass === "orange") return "↑";
	if (resultClass === "purple") return "↓";
	return "";
}

/** Randează o celulă numerică: valoare + săgeată de ghidaj, dacă este cazul. */
function renderValueCell(cell, value, resultClass) {
	setCellState(cell, resultClass, ["cell-arrow"]);
	cell.appendChild(createTextElement("span", "", value));

	const arrow = getArrowSymbol(resultClass);
	if (arrow) {
		cell.appendChild(createTextElement("span", "arrow-indicator", arrow));
	}
}

// ===============================
// Local statistics
// ===============================
/**
 * Citește statisticile locale din localStorage.
 * Dacă nu există statistici salvate, întoarce structura default.
 */
function getStats() {
	const defaultStats = {
		played: 0,
		won: 0,
		streak: 0,
		distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
	};
	let stats = JSON.parse(localStorage.getItem('f1-guesser-stats'));
	if (!stats) return defaultStats;
	if (!stats.distribution) stats.distribution = defaultStats.distribution;
	return stats;
}

/**
 * Actualizează statisticile după finalul unui joc.
 * Pentru înfrângere se resetează streak-ul, iar pentru victorie se actualizează distribuția încercărilor.
 */
function updateStats(isWin, attempts) {
	let stats = getStats();
	stats.played += 1;
	
	if (isWin) {
		stats.won += 1;
		stats.streak += 1;
		if (attempts >= 1 && attempts <= 6) {
			stats.distribution[attempts] = (stats.distribution[attempts] || 0) + 1;
		}
	} else {
		stats.streak = 0; // Resetăm streak-ul la înfrângere
	}
	
	localStorage.setItem('f1-guesser-stats', JSON.stringify(stats));
}

/** Calculează procentul de victorii, rotunjit la cel mai apropiat întreg. */
function calculateWinRate(stats) {
	return stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
}

/** Returnează valoarea maximă din distribuție; minim 1 pentru a evita împărțirea la zero. */
function getMaxDistributionValue(distribution) {
	return Math.max(...Object.values(distribution), 1);
}

/** Calculează lățimea barei de distribuție în procente. */
function calculateDistributionBarWidth(count, maxDistributionValue) {
	return count > 0 ? Math.max(10, Math.round((count / maxDistributionValue) * 100)) : 8;
}

/** Creează un rând din graficul de distribuție a încercărilor. */
function createDistributionRow(attemptNumber, count, barWidth) {
	const row = document.createElement('div');
	row.className = 'dist-row';

	const label = createTextElement('div', 'dist-label', attemptNumber);
	const barContainer = document.createElement('div');
	barContainer.className = 'dist-bar-container';

	const bar = createTextElement('div', 'dist-bar', count);
	bar.style.width = `${barWidth}%`;

	barContainer.appendChild(bar);
	row.append(label, barContainer);
	return row;
}

/** Actualizează sumarul statisticilor: jucate, win rate și streak. */
function renderStatsSummary(stats) {
	setTextContentById('stat-played', stats.played);
	setTextContentById('stat-winrate', `${calculateWinRate(stats)}%`);
	setTextContentById('stat-streak', stats.streak);
}

/** Randează toate cele 6 bare din distribuția încercărilor. */
function renderGuessDistribution(distribution) {
	const distributionContainer = document.getElementById('guess-distribution');
	if (!distributionContainer) return;

	distributionContainer.replaceChildren();
	const maxDistributionValue = getMaxDistributionValue(distribution);

	for (let attemptNumber = 1; attemptNumber <= 6; attemptNumber++) {
		const count = distribution[attemptNumber] || 0;
		const barWidth = calculateDistributionBarWidth(count, maxDistributionValue);
		distributionContainer.appendChild(
			createDistributionRow(attemptNumber, count, barWidth)
		);
	}
}

/** Funcție centrală pentru redesenarea statisticilor din popup-ul de final. */
function renderStats() {
	const stats = getStats();
	renderStatsSummary(stats);
	renderGuessDistribution(stats.distribution);
}


// ===============================
// End game popup, rematch and timer helpers
// ===============================
/** Construiește payload-ul trimis la server când pornim o rundă nouă cu dificultate aleasă. */
function buildRoundOptions(level) {
	return {
		level,
		timed: isTimedModeEnabled,
		timeLimitSeconds: selectedTimeLimitSeconds
	};
}

/** Construiește payload-ul pentru rematch. Folosește preferința curentă de timer din UI. */
function buildRestartOptions() {
	return {
		timed: isTimedModeEnabled,
		timeLimitSeconds: selectedTimeLimitSeconds
	};
}

/** Actualizează butoanele UI care indică dacă următoarea rundă este cu timp sau fără timp. */
function getTimerControlValue(control) {
	return control.dataset.timerMode || control.dataset.timer;
}

function syncTimerModeControls() {
	document.querySelectorAll("[data-timer-mode], .timer-item").forEach(control => {
		const value = getTimerControlValue(control);
		const isOffControl = value === "off";
		const controlSeconds = normalizeTimeLimitSeconds(value);
		const isActive = isOffControl
			? !isTimedModeEnabled
			: isTimedModeEnabled && controlSeconds === selectedTimeLimitSeconds;
		control.classList.toggle("active", isActive);
	});
}

/** Schimbă preferința locală pentru timer. Noua valoare se aplică la următorul start/rematch. */
function setTimedMode(enabled, timeLimitSeconds = selectedTimeLimitSeconds) {
	isTimedModeEnabled = enabled;
	selectedTimeLimitSeconds = normalizeTimeLimitSeconds(timeLimitSeconds);
	localStorage.setItem('f1-guesser-timed-mode', enabled ? 'on' : 'off');
	localStorage.setItem('f1-guesser-time-limit', String(selectedTimeLimitSeconds));
	syncTimerModeControls();

	// Dacă runda este deja pornită, nu schimbăm timerul curent.
	// Preferința este folosită la următorul Rematch / joc nou.
	const status = document.getElementById("status");
	if (status && !isRoundFinished && driversList.length > 0) {
		status.textContent = enabled
			? `Modul cu timp (${selectedTimeLimitSeconds}s) va fi folosit la următorul joc.`
			: "Modul fără timp va fi folosit la următorul joc.";
	}
}

function getRoundTimerElement() {
	return document.getElementById("roundTimer");
}

function stopRoundTimer() {
	if (roundTimerInterval) {
		clearInterval(roundTimerInterval);
		roundTimerInterval = null;
	}
	roundTimerEndsAt = null;
}

function hideRoundTimer() {
	stopRoundTimer();
	const timerEl = getRoundTimerElement();
	if (timerEl) {
		timerEl.classList.add("is-hidden");
		timerEl.classList.remove("timer-warning", "timer-danger");
		timerEl.style.setProperty("--timer-progress", "0%");
	}

	const timerValue = document.getElementById("roundTimerValue");
	if (timerValue) timerValue.textContent = `${selectedTimeLimitSeconds}s`;
}

function updateRoundTimerDisplay(secondsLeft, progressRatio = 0) {
	const timerEl = getRoundTimerElement();
	if (!timerEl) return;

	const safeSecondsLeft = Math.max(0, secondsLeft);
	const safeProgress = Math.min(1, Math.max(0, progressRatio));
	const timerValue = document.getElementById("roundTimerValue");

	if (timerValue) timerValue.textContent = `${safeSecondsLeft}s`;
	timerEl.style.setProperty("--timer-progress", `${safeProgress * 100}%`);
	timerEl.classList.toggle("timer-warning", safeSecondsLeft <= 15 && safeSecondsLeft > 5);
	timerEl.classList.toggle("timer-danger", safeSecondsLeft <= 5);
}

function startRoundTimer(timeLimitSeconds, roundStartedAt) {
	hideRoundTimer();

	currentRoundTimed = true;
	currentTimeLimitSeconds = timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS;
	const startedAt = roundStartedAt || Date.now();
	roundTimerEndsAt = startedAt + currentTimeLimitSeconds * 1000;

	const timerEl = getRoundTimerElement();
	if (timerEl) timerEl.classList.remove("is-hidden");

	function tick() {
		const msLeft = Math.max(0, roundTimerEndsAt - Date.now());
		const secondsLeft = Math.ceil(msLeft / 1000);
		const progressRatio = 1 - (msLeft / (currentTimeLimitSeconds * 1000));
		updateRoundTimerDisplay(secondsLeft, progressRatio);

		if (secondsLeft <= 0) {
			stopRoundTimer();
			if (!isRoundFinished && socket) socket.emit('timeExpired');
		}
	}

	tick();
	roundTimerInterval = setInterval(tick, 250);
}

function setSubmitButtonMode(mode) {
	const sendBtn = document.getElementById("sendGuessBtn");
	if (!sendBtn) return;

	if (mode === "rematch") {
		sendBtn.textContent = "🔄 Rematch";
		sendBtn.classList.add("rematch-submit-btn");
		return;
	}

	sendBtn.textContent = "Trimite";
	sendBtn.classList.remove("rematch-submit-btn");
}

function enterRematchMode() {
	isRematchMode = true;
	const gameZone = document.getElementById("gameZone");
	const status = document.getElementById("status");

	if (gameZone) {
		gameZone.classList.remove("game-zone-hidden");
		gameZone.classList.add("game-zone-rematch");
	}

	if (status) {
		status.classList.remove("is-hidden");
		status.textContent = "Runda s-a terminat. Apasă Rematch pentru un pilot nou.";
	}

	setSubmitButtonMode("rematch");
}

function exitRematchMode() {
	isRematchMode = false;
	const gameZone = document.getElementById("gameZone");
	if (gameZone) gameZone.classList.remove("game-zone-rematch");
	setSubmitButtonMode("submit");
}

function requestRematch() {
	if (socket) socket.emit('restartGame', buildRestartOptions());
}

function hideEndGamePopup(keepRematchAvailable = true) {
	const popup = document.getElementById("endGameDisplay");
	const backdrop = document.getElementById("endGameBackdrop");

	if (popup) popup.classList.remove("show");
	if (backdrop) backdrop.classList.remove("show");
	if (keepRematchAvailable && isRoundFinished) enterRematchMode();
}

function showEndGamePopup({ isCorrect, attempts, target, isTimedOut = false }) {
	isRoundFinished = true;
	isRematchMode = false;
	stopRoundTimer();

	const gz = document.getElementById("gameZone");
	const st = document.getElementById("status");
	if (gz) gz.classList.add("game-zone-hidden");
	if (st) st.classList.add("is-hidden");

	const popup = document.getElementById("endGameDisplay");
	const backdrop = document.getElementById("endGameBackdrop");
	if (!popup) return;

	popup.classList.remove("win-style", "lose-style");

	if (isCorrect) {
		document.getElementById("endGameTitle").innerText = "🏆 AI CÂȘTIGAT!";
		document.getElementById("endGameMessage").innerHTML = `Ai descoperit pilotul misterios în <strong>${attempts}</strong> ${attempts === 1 ? 'încercare' : 'încercări'}!`;
		popup.classList.add("win-style");
		updateStats(true, attempts);
	} else if (isTimedOut) {
		document.getElementById("endGameTitle").innerText = "⏱️ TIMP EXPIRAT!";
		document.getElementById("endGameMessage").innerHTML = `Timpul s-a terminat. Pilotul misterios era: <strong>${target ? target.name : 'Necunoscut'}</strong>`;
		popup.classList.add("lose-style");
		updateStats(false, 0);
	} else {
		document.getElementById("endGameTitle").innerText = "💀 AI PIERDUT!";
		document.getElementById("endGameMessage").innerHTML = `Din păcate nu ai ghicit. Pilotul misterios era: <strong>${target ? target.name : 'Necunoscut'}</strong>`;
		popup.classList.add("lose-style");
		updateStats(false, 0);
	}

	renderStats();
	if (backdrop) backdrop.classList.add("show");
	popup.classList.add("show");
}

// ===============================
// Socket events
// ===============================
/**
 * Leagă toate evenimentele Socket.IO primite de la server.
 * Se apelează o singură dată după conectarea socket-ului.
 */
function setupSocketEvents() {
	
	// Ștergem orice ascultător activ anterior pentru a preveni dublarea/multiplicarea numărului online
	socket.off('initGame');
	socket.off('roomUpdate');
	socket.off('guessResult');
	socket.off('gameRestarted');
		socket.off('gameTimedOut');
	
	socket.on('initGame', (data) => {
		const overlay = document.getElementById('difficulty-overlay');
		if (overlay) overlay.classList.add('hidden');
		
		driversList = data.drivers;
			isRoundFinished = false;
			exitRematchMode();
			if (data.timed) {
				startRoundTimer(data.timeLimitSeconds, data.roundStartedAt);
			} else {
				currentRoundTimed = false;
				hideRoundTimer();
			}
		
		const diffLabel = document.getElementById("diff-display-label");
		if (diffLabel) {
			diffLabel.innerText = `Mod: ${data.difficulty}`;
			diffLabel.className = `diff-display-label difficulty-${data.difficulty}`;
		}

		const statusEl = document.getElementById("status");
		if (statusEl) statusEl.innerText = "Ghicește pilotul misterios!";
		
		initializeGridStructure();
		
		const gameZone = document.getElementById("gameZone");
		if (gameZone) gameZone.classList.remove("game-zone-hidden");
	});

	socket.on('roomUpdate', (data) => {
		const badge = document.getElementById("duelStatus");
		if (badge) {
			// Folosim direct valoarea curată trimisă de server
			badge.innerText = `Online: ${data.playerCount}`;
		}
	});

	socket.on('guessResult', (data) => {
		// Preluăm rezultatele pre-calculate de pe server
		const { guess, results, attempts, isCorrect, isGameOver, target } = data;
		let rowIndex = attempts - 1; 

		let c0 = document.getElementById(`cell-${rowIndex}-0`);
		if (!c0) return; 
		
		// Marcăm vizual numărul încercării curente, fără să afectăm rezultatele din cele 6 coloane.
		const attemptIndexCell = document.getElementById(`attempt-${rowIndex}`);
		if (attemptIndexCell) {
			attemptIndexCell.classList.add("attempt-completed", "cell-reveal");
		}

		// --- CELULE REZULTAT ---
		renderDriverCell(c0, guess, results.name);
		renderCountryCell(document.getElementById(`cell-${rowIndex}-1`), guess, results.nat);
		renderTeamCell(document.getElementById(`cell-${rowIndex}-2`), guess, results.team);
		renderValueCell(document.getElementById(`cell-${rowIndex}-3`), guess.age, results.age);
		renderValueCell(document.getElementById(`cell-${rowIndex}-4`), guess.debut, results.debut);
		renderValueCell(document.getElementById(`cell-${rowIndex}-5`), guess.wins, results.wins);

			// --- LOGICĂ FINAL JOC ---
			if (isGameOver) {
				showEndGamePopup({ isCorrect, attempts, target });
			}
		});

		socket.on('gameTimedOut', (data) => {
			showEndGamePopup({
				isCorrect: false,
				attempts: data.attempts || 0,
				target: data.target,
				isTimedOut: true
			});
		});

		socket.on('gameRestarted', (data = {}) => {
			isRoundFinished = false;
			exitRematchMode();
			initializeGridStructure();
			hideEndGamePopup(false);
			
			const popup = document.getElementById("endGameDisplay");
			if (popup) popup.className = "end-game-popup";

			const backdrop = document.getElementById("endGameBackdrop");
			if (backdrop) backdrop.classList.remove("show");
			
			const gz = document.getElementById("gameZone");
			const st = document.getElementById("status");
			if (gz) gz.classList.remove("game-zone-hidden");
			if (st) st.classList.remove("is-hidden");
			if (st) st.innerText = "Ghicește noul pilot misterios!";

			if (data.timed) {
				startRoundTimer(data.timeLimitSeconds, data.roundStartedAt);
			} else {
				currentRoundTimed = false;
				hideRoundTimer();
			}
			
			const inputEl = document.getElementById("driverInput");
			if (inputEl) inputEl.value = "";

			selectedDriverId = null;
			currentFocus = -1;
		});
}

// ===============================
// App bootstrap and UI event binding
// ===============================
/**
 * Bootstrap UI.
 * Tot ce ține de accesarea DOM-ului și event listeners se leagă după încărcarea documentului.
 */
document.addEventListener("DOMContentLoaded", () => {
	
	// Logica pentru meniu hamburger dropdown
	const menuBtn = document.getElementById("menu-hamburger");
	const menu = document.getElementById("dropdown-menu");

	if (menuBtn && menu) {
		menuBtn.addEventListener("click", (e) => {
			e.stopPropagation(); // Previne propagarea
			menu.classList.toggle("hidden");
		});
	}

	// Logica pentru click pe titlul principal (logo) -> Reîncărcare/Home
	const siteTitle = document.querySelector(".site-header h1");
	if (siteTitle) {
		siteTitle.addEventListener("click", () => {
			window.location.reload();
		});
	}

	// --- Schimbare dificultate din dropdown ---
	document.querySelectorAll(".menu-item:not(.theme-item):not(.timer-item)").forEach(item => {
		item.addEventListener("click", function() {
			const choice = this.getAttribute("data-level");
			if (menu) menu.classList.add("hidden");

			if (choice === "home") {
				window.location.reload(); 
			} else if (choice) {
				// Când se schimbă dificultatea din dropdown, ascundem overlay-ul dacă e deschis
				const overlay = document.getElementById('difficulty-overlay');
				if (overlay) overlay.classList.add('hidden');

				console.log("Schimbare dificultate cerută în meci:", choice);
				socket.emit('setDifficulty', buildRoundOptions(choice));
			}
		});
	});

	// --- Schimbare teme vizuale, local în browser ---
	const savedTheme = localStorage.getItem('f1-guesser-theme') || 'default';
	document.body.setAttribute('data-app-theme', savedTheme);

	document.querySelectorAll(".theme-item").forEach(item => {
		item.addEventListener("click", function(e) {
			e.stopPropagation(); // Oprim propagarea ca să nu închidă alte meniuri aiurea
			const selectedTheme = this.getAttribute("data-theme");
			
			// Aplicăm tema pe body
			document.body.setAttribute('data-app-theme', selectedTheme);
			
			// Salvăm în memoria browserului
			localStorage.setItem('f1-guesser-theme', selectedTheme);
			
			// Închidem doar meniul dropdown, fără să trimitem nimic la server
			if (menu) menu.classList.add("hidden");
			console.log(`Tema vizuală schimbată la: ${selectedTheme}`);
		});
	});

	document.querySelectorAll("[data-timer-mode]").forEach(button => {
		button.addEventListener("click", function() {
			const value = this.dataset.timerMode;
			setTimedMode(value !== "off", value);
		});
	});

	document.querySelectorAll(".timer-item").forEach(item => {
		item.addEventListener("click", function(e) {
			e.stopPropagation();
			const value = this.dataset.timer;
			setTimedMode(value !== "off", value);
			if (menu) menu.classList.add("hidden");
		});
	});
	syncTimerModeControls();
	
		// --- Buton share: copiază linkul camerei curente ---
	const shareBtn = document.getElementById("shareRoomBtn");
	if (shareBtn) {
		shareBtn.addEventListener("click", () => {
			const currentUrl = window.location.href;

			if (navigator.clipboard && navigator.clipboard.writeText) {
				// Calea nativă, optimizată securizat
				navigator.clipboard.writeText(currentUrl).then(() => {
					triggerTooltip();
				}).catch(err => {
					console.error("Eroare la copiere nativă:", err);
					fallbackCopyText(currentUrl);
				});
			} else {
				// Fallback în caz că API-ul este restricționat (non-HTTPS / browsere vechi)
				fallbackCopyText(currentUrl);
			}
		});
	}

	/**
	 * Fallback pentru copierea linkului camerei când Clipboard API nu este disponibil.
	 */
	function fallbackCopyText(text) {
		const textArea = document.createElement("textarea");
		textArea.value = text;
		// Evităm scroll-ul paginii în timp ce adăugăm temporar elementul în DOM
		textArea.classList.add("fallback-copy-textarea");
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();
		try {
			document.execCommand('copy');
			triggerTooltip();
		} catch (err) {
			console.error('Fallback eșuat completely:', err);
			alert("Nu s-a putut copia automat. Link-ul tău este: " + text);
		}
		document.body.removeChild(textArea);
	}

	/** Afișează temporar tooltip-ul "Copiat!" de pe butonul de share. */
	function triggerTooltip() {
		shareBtn.classList.add("copied");
		setTimeout(() => {
			shareBtn.classList.remove("copied");
		}, 2000);
	}
	
	// Încercăm să conectăm socket-ul în siguranță
	try {
		if (typeof io !== 'undefined') {
			socket = io();
			setupSocketEvents();
		} else {
			console.error("Eroare: Socket.io nu este încărcat! Pornește serverul cu 'node server.js' și accesează http://localhost:3000");
		}
	} catch (err) {
		console.error("Eroare conexiune server:", err);
	}

	const urlParams = new URLSearchParams(window.location.search);
	let roomId = urlParams.get('room');

	if (!roomId) {
		roomId = Math.random().toString(36).substring(2, 9);
		window.history.pushState({}, '', `?room=${roomId}`);
	}
	
	// Actualizăm dinamic textul butonului din header cu ID-ul camerei curente
	const roomBtnTextEl = document.getElementById("roomBtnText");
	if (roomBtnTextEl) {
		roomBtnTextEl.textContent = `🏁 Room: ${roomId}`;
	}

	const linkTextEl = document.getElementById("linkText");
	if (linkTextEl) linkTextEl.innerText = window.location.href;

	if (socket) {
		socket.emit('joinRoom', roomId);
	}

	// --- LEGAREA BUTOANELOR DIN OVERLAY ---
	document.querySelectorAll(".btn-diff").forEach(button => {
		button.addEventListener("click", function() {
			const level = this.getAttribute("data-level");
			const overlay = document.getElementById('difficulty-overlay');
			if (overlay) overlay.classList.add('hidden');
			
			console.log("S-a apasat dificultatea din overlay:", level);
			if (socket) {
				socket.emit('setDifficulty', buildRoundOptions(level));
			} else {
				alert("Butonul funcționează, dar nu ești conectat la server! Porneste 'node server.js'");
			}
		});
	});

	const sendBtn = document.getElementById("sendGuessBtn");
	if (sendBtn) {
		sendBtn.addEventListener("click", sendGuess);
	}

	const restartBtn = document.getElementById("restartGameBtn");
	if (restartBtn) {
		restartBtn.addEventListener("click", requestRematch);
	}

	const driverInput = document.getElementById("driverInput");
	if (driverInput) {
		driverInput.addEventListener("input", function(e) {
			showPredictions(e.target.value);
		});

		driverInput.addEventListener("keydown", handleAutocompleteKeydown);
	}

	const closePopupBtn = document.getElementById("closeEndGamePopup");
	if (closePopupBtn) {
		closePopupBtn.addEventListener("click", () => hideEndGamePopup(true));
	}

	document.addEventListener("keydown", function(e) {
		const popup = document.getElementById("endGameDisplay");
		const isPopupOpen = popup && popup.classList.contains("show");

		if (isPopupOpen && e.key === "Escape") {
			e.preventDefault();
			hideEndGamePopup(true);
		}

		if (isPopupOpen && e.key === "Enter") {
			e.preventDefault();
			requestRematch();
		}
	});

	document.addEventListener("click", function (e) {
		// Închide sugestiile de piloți dacă dai click în afară
		if (e.target.id !== "driverInput") {
			clearSuggestions();
		}
		// Închide meniul dropdown dacă dai click în afara lui sau a hamburgerului
		if (menu && !menu.classList.contains("hidden") && e.target.id !== "menu-hamburger"  && !shareBtn.contains(e.target)) {
			menu.classList.add("hidden");
		}
	});
});
