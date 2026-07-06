/** Flag and team logo helpers. */
import { F1_TO_ISO, TEAM_LOGO_FILES } from './constants.js';

const DEFAULT_TEAM_LOGO_PATH = '/logos/F1.svg';
const DEFAULT_FLAG_PATH = '/flags/un.svg';

/** Transformă codul de naționalitate F1/FIA în cod ISO pentru fișierul SVG local. */
export function getIsoCode(nationality) {
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
export function getLocalTeamLogoPath(teamName) {
	const fileName = TEAM_LOGO_FILES[normalizeTeamLogoKey(teamName)];
	return fileName ? `/logos/${fileName}` : null;
}

/** Fallback local pentru logo-uri de echipe. */
export function handleTeamLogoError(imgElement) {
	imgElement.onerror = null;
	imgElement.src = DEFAULT_TEAM_LOGO_PATH;
}

/** Fallback local pentru steaguri. */
export function handleFlagError(imgElement) {
	imgElement.onerror = null;
	imgElement.src = DEFAULT_FLAG_PATH;
}

/**
 * Generează emoji de steag din cod de țară.
 * Momentan este păstrată ca utilitar fallback, chiar dacă UI-ul principal folosește imagini SVG.
 */
export function getFlagEmoji(countryCode) {
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
