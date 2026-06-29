import { createTextElement } from './domUtils.js';
import { getIsoCode, getLocalTeamLogoPath, handleFlagError, handleTeamLogoError } from './assets.js';

/** Construiește gridul principal al jocului: header + 6 rânduri x 6 coloane. */
export function initializeGridStructure() {
	const grid = document.getElementById("grid");
	if (!grid) return;
	let html = `
		<div class="cell header attempt-header">#</div>
		<div class="cell header">PILOT</div><div class="cell header">ȚARĂ</div><div class="cell header">ECHIPĂ</div>
		<div class="cell header">VÂRSTĂ</div><div class="cell header">DEBUT</div><div class="cell header">WINS</div>
	`;
	for (let row = 0; row < 6; row++) {
		html += `<div class="cell attempt-index" id="attempt-${row}" aria-label="Încercarea ${row + 1}">${row + 1}</div>`;
		for (let col = 0; col < 6; col++) {
			html += `<div class="cell" id="cell-${row}-${col}"></div>`;
		}
	}
	grid.innerHTML = html;
}

function setCellState(cell, resultClass, extraClasses = []) {
	if (!cell) return;
	cell.className = ["cell", "cell-reveal", resultClass, ...extraClasses].filter(Boolean).join(" ");
	cell.replaceChildren();
}

function renderDriverCell(cell, guess, resultClass) {
	setCellState(cell, resultClass, ["cell-driver"]);
	cell.append(
		createTextElement("span", "cell-driver-id", guess.id),
		createTextElement("span", "cell-driver-name", guess.name)
	);
}

function renderCountryCell(cell, guess, resultClass) {
	setCellState(cell, resultClass, ["cell-media", "cell-country"]);

	const isoCode = getIsoCode(guess.nat);
	const flag = document.createElement("img");
	flag.className = "cell-country-flag";
	flag.src = `/flags/${isoCode}.svg`;
	flag.alt = guess.nat;
	flag.onerror = () => handleFlagError(flag, isoCode, 0);

	cell.append(flag, createTextElement("span", "cell-media-label", guess.nat));
}

function renderTeamCell(cell, guess, resultClass) {
	setCellState(cell, resultClass, ["cell-media", "cell-team"]);

	const currentGuessTeam = guess.team[0];
	const logo = document.createElement("img");
	logo.className = "cell-team-logo";
	logo.src = getLocalTeamLogoPath(currentGuessTeam) || "/logos/F1.svg";
	logo.alt = currentGuessTeam;
	logo.onerror = () => handleTeamLogoError(logo, currentGuessTeam, 0);

	cell.append(logo, createTextElement("span", "cell-media-label", currentGuessTeam.substring(0, 5)));
}

function getArrowSymbol(resultClass) {
	if (resultClass === "orange") return "↑";
	if (resultClass === "purple") return "↓";
	return "";
}

function renderValueCell(cell, value, resultClass) {
	setCellState(cell, resultClass, ["cell-arrow"]);
	cell.appendChild(createTextElement("span", "", value));

	const arrow = getArrowSymbol(resultClass);
	if (arrow) {
		cell.appendChild(createTextElement("span", "arrow-indicator", arrow));
	}
}

/** Randează rezultatul unei ghiciri pe rândul curent. */
export function renderGuessResult({ guess, results, attempts }) {
	const rowIndex = attempts - 1;
	const firstCell = document.getElementById(`cell-${rowIndex}-0`);
	if (!firstCell) return false;

	const attemptIndexCell = document.getElementById(`attempt-${rowIndex}`);
	if (attemptIndexCell) {
		attemptIndexCell.classList.add("attempt-completed", "cell-reveal");
	}

	renderDriverCell(firstCell, guess, results.name);
	renderCountryCell(document.getElementById(`cell-${rowIndex}-1`), guess, results.nat);
	renderTeamCell(document.getElementById(`cell-${rowIndex}-2`), guess, results.team);
	renderValueCell(document.getElementById(`cell-${rowIndex}-3`), guess.age, results.age);
	renderValueCell(document.getElementById(`cell-${rowIndex}-4`), guess.debut, results.debut);
	renderValueCell(document.getElementById(`cell-${rowIndex}-5`), guess.wins, results.wins);
	return true;
}
