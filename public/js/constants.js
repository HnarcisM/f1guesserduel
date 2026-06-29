/** Shared frontend constants for F1 Guesser Duel. */
// Mapare coduri FIA/F1 către coduri ISO folosite de fișierele SVG din /flags.
export const F1_TO_ISO = {
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
export const TEAM_LOGO_FILES = {
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
	"cadillac": "Cadillac.svg",
	"ats": "ATS.svg",
	"bmw": "BMW.svg",
	"brm": "BRM.svg",
	"cooper": "Cooper.svg",
	"eagle": "Eagle.svg",
	"ensign": "Ensign.svg",
	"fittipaldi": "Fittipaldi.svg",
	"forti": "Forti.svg",
	"hesketh": "Hesketh.svg",
	"hrt": "HRT.svg",
	"lola": "Lola.svg",
	"martini": "Martini.svg",
	"maserati": "Maserati.svg",
	"matra": "Matra.svg",
	"midland": "Midland.svg",
	"scuderiaitalia": "ScuderiaItalia.svg",
	"simtek": "Simtek.svg",
	"surtees": "Surtees.svg",
	"toleman": "Toleman.svg",
	"vanwall": "Vanwall.svg",
	"virgin": "Virgin.svg",
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

export const DEFAULT_TIME_LIMIT_SECONDS = 60;
export const ALLOWED_TIME_LIMIT_SECONDS = [60, 90, 120];

/** Normalizează durata timerului la una dintre opțiunile suportate. */
export function normalizeTimeLimitSeconds(value) {
	const seconds = Number(value);
	return ALLOWED_TIME_LIMIT_SECONDS.includes(seconds) ? seconds : DEFAULT_TIME_LIMIT_SECONDS;
}

