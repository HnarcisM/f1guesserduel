import { getIsoCode, handleFlagError } from './assets.js';

/** Autocomplete controller pentru inputul de piloți. */
export function createAutocomplete({ getDriversList, onSubmitGuess }) {
	let selectedDriverId = null;
	let currentFocus = -1;

	function getSuggestionsContainer() {
		return document.getElementById("suggestions");
	}

	function getSuggestionItems() {
		const suggestions = getSuggestionsContainer();
		return suggestions ? suggestions.getElementsByTagName("li") : null;
	}

	function clearSuggestions() {
		const suggestions = getSuggestionsContainer();
		if (suggestions) suggestions.replaceChildren();
		currentFocus = -1;
	}

	function resetSelection() {
		selectedDriverId = null;
		currentFocus = -1;
		clearSuggestions();
	}

	function showPredictions(value) {
		selectedDriverId = null;
		currentFocus = -1;
		renderSuggestions(filterDriverPredictions(value));
	}

	function filterDriverPredictions(value) {
		const query = value.trim().toLowerCase();
		if (!query) return [];

		return getDriversList().filter(driver => {
			const nameParts = driver.name.toLowerCase().split(" ");
			return nameParts.some(part => part.startsWith(query));
		});
	}

	function renderSuggestions(drivers) {
		const listContainer = getSuggestionsContainer();
		if (!listContainer) return;

		listContainer.replaceChildren();
		drivers.forEach(driver => {
			listContainer.appendChild(createSuggestionItem(driver));
		});
	}

	function createSuggestionItem(driver) {
		const li = document.createElement("li");
		li.dataset.id = driver.id;
		li.dataset.name = driver.name;

		const isoCode = getIsoCode(driver.nat);
		const flag = document.createElement("img");
		flag.className = "suggestion-driver-flag";
		flag.src = `/flags/${isoCode}.svg`;
		flag.alt = "";
		flag.loading = "lazy";
		flag.decoding = "async";
		flag.width = 26;
		flag.height = 18;
		flag.setAttribute("aria-hidden", "true");
		flag.onerror = () => handleFlagError(flag);

		const name = document.createElement("span");
		name.className = "suggestion-driver-name";
		name.textContent = driver.name;

		li.append(flag, name);
		li.addEventListener("click", () => selectDriverSuggestion(driver));
		return li;
	}

	function selectDriverSuggestion(driver) {
		const inputEl = document.getElementById("driverInput");
		if (inputEl) inputEl.value = driver.name;
		selectedDriverId = driver.id;
		clearSuggestions();
		onSubmitGuess();
	}

	function selectSuggestionItem(item) {
		if (!item) return;
		const inputEl = document.getElementById("driverInput");
		if (inputEl) inputEl.value = item.dataset.name || item.textContent.trim();
		selectedDriverId = item.dataset.id;
		clearSuggestions();
		onSubmitGuess();
	}

	function handleKeydown(e) {
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
				onSubmitGuess();
			}
		}
	}

	function addActive(list) {
		if (!list || list.length === 0) return;
		removeActive(list);
		if (currentFocus >= list.length) currentFocus = 0;
		if (currentFocus < 0) currentFocus = (list.length - 1);
		list[currentFocus].classList.add("active");
		list[currentFocus].scrollIntoView({ block: "nearest" });
	}

	function removeActive(list) {
		for (let i = 0; i < list.length; i++) {
			list[i].classList.remove("active");
		}
	}

	return {
		showPredictions,
		handleKeydown,
		clearSuggestions,
		resetSelection,
		getSelectedDriverId: () => selectedDriverId,
		clearSelectedDriverId: () => { selectedDriverId = null; }
	};
}
