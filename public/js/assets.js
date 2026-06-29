/** Flag and team logo helpers. */
import { F1_TO_ISO, TEAM_LOGO_FILES } from './constants.js';

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

/**
 * Fallback pentru logo-uri de echipe.
 * Ordine: fișier local -> logo online cunoscut -> logo generic F1.
 */
export function handleTeamLogoError(imgElement, teamName, currentStep) {
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
export function handleFlagError(imgElement, isoCode, currentStep) {
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

