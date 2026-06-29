/** Small safe DOM helpers. */
/**
 * Creează un element text sigur.
 * Folosește textContent, nu innerHTML, pentru a evita inserarea de HTML nedorit.
 */
export function createTextElement(tagName, className, text) {
	const element = document.createElement(tagName);
	if (className) element.className = className;
	element.textContent = text;
	return element;
}

/**
 * Setează rapid textul unui element căutat după ID, doar dacă elementul există.
 */
export function setTextContentById(elementId, value) {
	const element = document.getElementById(elementId);
	if (element) element.textContent = value;
}

