// Global, ca să poată fi accesat în siguranță
let socket;

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

	// --- LOGICĂ SCHIMBARE DIFICULTATE (DOAR PENTRU EX, MED, HARD, HOME) ---
	document.querySelectorAll(".menu-item:not(.theme-item)").forEach(item => {
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
				socket.emit('setDifficulty', choice);
			}
		});
	});

	// --- LOGICĂ SCHIMBARE TEME VIZUALE (SEPARATĂ COMPLET) ---
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

	const roomBadge = document.getElementById("roomBadge");

	if(roomBadge){

		roomBadge.innerHTML = `🏁 ROOM #${roomId.toUpperCase()}`;

		roomBadge.addEventListener("click", async ()=>{

			try{

				await navigator.clipboard.writeText(window.location.href);

				roomBadge.innerHTML="✅ LINK COPIAT!";
				roomBadge.classList.add("copied");

				setTimeout(()=>{

					roomBadge.innerHTML=`🏁 ROOM #${roomId.toUpperCase()}`;
					roomBadge.classList.remove("copied");

				},2000);

			}catch{

				alert("Nu s-a putut copia link-ul.");

			}

		});

	}

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
				socket.emit('setDifficulty', level);
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
		restartBtn.addEventListener("click", function() {
			if (socket) socket.emit('restartGame');
		});
	}

	const driverInput = document.getElementById("driverInput");
	if (driverInput) {
		driverInput.addEventListener("input", function(e) {
			showPredictions(e.target.value);
		});

		driverInput.addEventListener("keydown", function(e) {
			let list = document.getElementById("suggestions");
			if (list) list = list.getElementsByTagName("li");
			
			if (e.keyCode == 40) {
				currentFocus++;
				addActive(list);
			} else if (e.keyCode == 38) {
				currentFocus--;
				addActive(list);
			} else if (e.keyCode == 13) {
				e.preventDefault();
				if (currentFocus > -1 && list && list[currentFocus]) {
					const driverName = list[currentFocus].innerText;
					const driverId = list[currentFocus].getAttribute("data-id");
					driverInput.value = driverName;
					selectedDriverId = driverId;
					const sug = document.getElementById("suggestions");
					if (sug) sug.innerHTML = "";
					currentFocus = -1;
					sendGuess();
				} else {
					sendGuess();
				}
			}
		});
	}

	document.addEventListener("click", function (e) {
		// Închide sugestiile de piloți dacă dai click în afară
		if (e.target.id !== "driverInput") {
			const sug = document.getElementById("suggestions");
			if (sug) sug.innerHTML = "";
		}
		// Închide meniul dropdown dacă dai click în afara lui sau a hamburgerului
		if (menu && !menu.classList.contains("hidden") && e.target.id !== "menu-hamburger") {
			menu.classList.add("hidden");
		}
	});
}); 

let driversList = [];
let selectedDriverId = null;
let currentFocus = -1;

function initializeGridStructure() {
	const grid = document.getElementById("grid");
	if (!grid) return;
	let html = `
		<div class="cell header">PILOT</div><div class="cell header">ȚARĂ</div><div class="cell header">ECHIPĂ</div>
		<div class="cell header">VÂRSTĂ</div><div class="cell header">DEBUT</div><div class="cell header">WINS</div>
	`;
	for (let row = 0; row < 6; row++) {
		for (let col = 0; col < 6; col++) {
			html += `<div class="cell" id="cell-${row}-${col}"></div>`;
		}
	}
	grid.innerHTML = html;
}

function showPredictions(value) {
	const listContainer = document.getElementById("suggestions");
	if (!listContainer) return;
	listContainer.innerHTML = "";
	selectedDriverId = null;
	currentFocus = -1;
	const query = value.trim().toLowerCase();
	if (!query) return;

	const filtered = driversList.filter(driver => {
		const nameParts = driver.name.toLowerCase().split(" ");
		return nameParts.some(part => part.startsWith(query));
	});

	filtered.forEach((driver) => {
		const li = document.createElement("li");
		li.innerText = driver.name;
		li.setAttribute("data-id", driver.id);
		
		// MODIFICAREA AICI: Când dai click, se completează ȘI se trimite automat!
		li.onclick = () => {
			const inputEl = document.getElementById("driverInput");
			if (inputEl) inputEl.value = driver.name;
			selectedDriverId = driver.id;
			listContainer.innerHTML = "";
			currentFocus = -1;
			
			// Trimite automat ghicirea fără să mai fie nevoie de click pe butonul "Trimite"
			sendGuess(); 
		};
		
		listContainer.appendChild(li);
	});
}

function sendGuess() {
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
	const sug = document.getElementById("suggestions");
	if (sug) sug.innerHTML = "";
	selectedDriverId = null;
	currentFocus = -1;
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

function setupSocketEvents() {
	socket.on('initGame', (data) => {
		const overlay = document.getElementById('difficulty-overlay');
		if (overlay) overlay.classList.add('hidden');
		
		driversList = data.drivers;
		
		const diffLabel = document.getElementById("diff-display-label");
		if (diffLabel) {
			diffLabel.innerText = `Mod: ${data.difficulty}`;
			if(data.difficulty === 'easy') diffLabel.style.color = '#00ff88';
			if(data.difficulty === 'medium') diffLabel.style.color = '#ffaa00';
			if(data.difficulty === 'hard') diffLabel.style.color = '#ff3333';
		}

		const statusEl = document.getElementById("status");
		if (statusEl) statusEl.innerText = "Ghicește pilotul misterios!";
		
		initializeGridStructure();
		
		const gameZone = document.getElementById("gameZone");
		if (gameZone) gameZone.style.display = "block";
	});

	socket.on('roomUpdate', (data) => {
		const badge = document.getElementById("duelStatus");
		if (badge) badge.innerText = `Online: ${data.playerCount}`;
	});

socket.on('guessResult', (data) => {
		// Preluăm rezultatele pre-calculate de pe server
		const { guess, results, attempts, isCorrect, isGameOver, target } = data;
		let rowIndex = attempts - 1; 

		let c0 = document.getElementById(`cell-${rowIndex}-0`);
		if (!c0) return; 
		
		// --- CELULA 0: PILOT (Nume și ID) ---
		c0.className = `cell ${results.name}`;
		c0.style.flexDirection = "column";
		c0.style.lineHeight = "1.3";
		c0.style.padding = "4px 2px";
		c0.style.justifyContent = "space-between";
		c0.style.alignItems = "stretch";
		c0.innerHTML = `
			<span style="font-size: 14px; font-weight: 800; display: block; letter-spacing: 0.5px; margin-bottom: 2px;">
				${guess.id}
			</span>
			<span style="
				font-size: 10px; 
				font-weight: 700; 
				text-transform: none; 
				color: #ffffff; 
				display: block; 
				background: rgba(0, 0, 0, 0.4); 
				padding: 2px 4px; 
				border-radius: 4px;
				word-break: break-word;
			">
				${guess.name}
			</span>
		`;

		// --- CELULA 1: ȚARĂ ---
		let c1 = document.getElementById(`cell-${rowIndex}-1`);
		if (c1) { 
			c1.className = `cell ${results.nat}`; 
			c1.style.position = "relative";
			c1.style.padding = "0";
			c1.style.overflow = "hidden";
			c1.style.display = "flex";
			c1.style.flexDirection = "column";
			c1.style.justifyContent = "flex-end";
			c1.style.alignItems = "stretch";

			const f1ToIso = {
				"GBR": "gb", "GER": "de", "NED": "nl", "SUI": "ch", "SPA": "es",
				"RSA": "za", "MAS": "my", "MON": "mc", "UAE": "ae", "CHI": "cl",
				"URU": "uy", "DEN": "dk", "POR": "pt", "THA": "th", "MEX": "mx",
				"BUL": "bg", "CRO": "hr", "FRA": "fr", "ITA": "it", "USA": "us",
				"CAN": "ca", "AUS": "au", "AUT": "at", "BRA": "br", "FIN": "fi",
				"JPN": "jp", "NZL": "nz", "BEL": "be", "SWE": "se", "ARG": "ar"
			};
			let isoCode = f1ToIso[guess.nat.toUpperCase()] || guess.nat.substring(0, 2).toLowerCase();

			c1.innerHTML = `
				<img src="/flags/${isoCode}.png" alt="${guess.nat}" 
					onerror="handleFlagError(this, '${isoCode}', 0)"
					style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; z-index: 1;"
				>
				<span style="position: relative; z-index: 2; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #ffffff; background: rgba(0, 0, 0, 0.5); padding: 2px 4px; border-radius: 4px; margin: 2px; text-align: center;">
					${guess.nat}
				</span>
			`;
		}
		
		// --- CELULA 2: ECHIPĂ ---
		let c2 = document.getElementById(`cell-${rowIndex}-2`);
		if (c2) { 
			c2.className = `cell ${results.team}`; 
			c2.style.position = "relative";
			c2.style.padding = "0";
			c2.style.overflow = "hidden";
			c2.style.display = "flex";
			c2.style.flexDirection = "column";
			c2.style.justifyContent = "flex-end";
			c2.style.alignItems = "stretch";

			let currentGuessTeam = guess.team[0];
			let cleanTeamName = currentGuessTeam.replace(/\s+/g, '');
			if (cleanTeamName.toLowerCase() === "sauber") cleanTeamName = "Stake";
			if (cleanTeamName.toUpperCase() === "RB" || cleanTeamName.toLowerCase() === "racingbulls" || cleanTeamName.toLowerCase() === "alphatauri") {
				cleanTeamName = "ToroRosso";
			}

			c2.innerHTML = `
				<img src="/logos/${cleanTeamName}.png" alt="${currentGuessTeam}" 
					onerror="handleTeamLogoError(this, '${currentGuessTeam}', 0)"
					style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -55%); width: 80%; height: 80%; object-fit: contain; opacity: 0.55; z-index: 1;"
				>
				<span style="position: relative; z-index: 2; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #ffffff; background: rgba(0, 0, 0, 0.5); padding: 2px 4px; border-radius: 4px; margin: 2px; text-align: center;">
					${currentGuessTeam.substring(0, 5)}
				</span>
			`;
		}
		
		// --- CELULA 3: VÂRSTĂ ---
		let c3 = document.getElementById(`cell-${rowIndex}-3`);
		if (c3) { 
			c3.className = `cell ${results.age} cell-arrow`; 
			let arrow = results.age === 'orange' ? '↑' : (results.age === 'purple' ? '↓' : '');
			c3.innerHTML = `<span>${guess.age}</span>${arrow ? `<span class="arrow-indicator">${arrow}</span>` : ''}`;
		}
		
		// --- CELULA 4: DEBUT ---
		let c4 = document.getElementById(`cell-${rowIndex}-4`);
		if (c4) { 
			c4.className = `cell ${results.debut} cell-arrow`; 
			let arrow = results.debut === 'orange' ? '↑' : (results.debut === 'purple' ? '↓' : '');
			c4.innerHTML = `<span>${guess.debut}</span>${arrow ? `<span class="arrow-indicator">${arrow}</span>` : ''}`;
		}
		
		// --- CELULA 5: VICTORII ---
		let c5 = document.getElementById(`cell-${rowIndex}-5`);
		if (c5) { 
			c5.className = `cell ${results.wins} cell-arrow`; 
			let arrow = results.wins === 'orange' ? '↑' : (results.wins === 'purple' ? '↓' : '');
			c5.innerHTML = `<span>${guess.wins}</span>${arrow ? `<span class="arrow-indicator">${arrow}</span>` : ''}`;
		}

		// --- LOGICĂ FINAL JOC ---
		if (isGameOver) {
			const gz = document.getElementById("gameZone");
			const st = document.getElementById("status");
			if (gz) gz.style.display = "none";
			if (st) st.style.display = "none";

			const popup = document.getElementById("endGameDisplay");

			// Resetăm clasele vechi de stil ca să nu se suprapună la meciuri consecutive
			popup.classList.remove("win-style", "lose-style");

			if (isCorrect) {
				document.getElementById("endGameTitle").innerText = "🏆 AI CÂȘTIGAT!";
				document.getElementById("endGameMessage").innerHTML = `Ai descoperit pilotul misterios în <strong>${attempts}</strong> ${attempts === 1 ? 'încercare' : 'încercări'}!`;
				popup.classList.add("win-style"); // Aplică stilul auriu + pulse
				
				// [AICI AM ADĂUGAT]: Salvăm meciul câștigat în statistici
				updateStats(true, attempts);
			} else {
				document.getElementById("endGameTitle").innerText = "💀 AI PIERDUT!";
				document.getElementById("endGameMessage").innerHTML = `Din păcate nu ai ghicit. Pilotul misterios era: <strong>${target ? target.name : 'Necunoscut'}</strong>`;
				popup.classList.add("lose-style"); // Aplică stilul roșu + scuturare
				
				// [AICI AM ADĂUGAT]: Salvăm meciul pierdut în statistici
				updateStats(false, 0);
			}
			
			// [AICI AM ADĂUGAT]: Calculăm și desenăm graficele în popup
			renderStats();
			
			// Afișăm popup-ul cu noul efect elastic
			popup.classList.add("show");
		}
	});

		socket.on('gameRestarted', () => {
		initializeGridStructure();
		
		// Ascundem popup-ul și ștergem stilurile specifice de meci trecut
		const popup = document.getElementById("endGameDisplay");
		if (popup) {
			popup.className = "end-game-popup"; // Revine la clasa de bază curată
		}
		
		const gz = document.getElementById("gameZone");
		const st = document.getElementById("status");
		if (gz) gz.style.display = "block";
		if (st) st.style.display = "block";
		if (st) st.innerText = "Ghicește noul pilot misterios!";
		
		const inputEl = document.getElementById("driverInput");
		if (inputEl) inputEl.value = "";

		selectedDriverId = null;
		currentFocus = -1;
	});
}

// Funcție ajutătoare pentru a converti codul țării (ex: GBR) în Emoji de Steag
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

// Funcție universală de fallback pentru logourile echipelor
function handleTeamLogoError(imgElement, teamName, currentStep) {
    // Curățăm numele echipei pentru rutele locale
    let cleanName = teamName.replace(/\s+/g, '');
    if (cleanName.toLowerCase() === "sauber") cleanName = "Stake";
    if (cleanName.toUpperCase() === "RB" || cleanName.toLowerCase() === "racingbulls" || cleanName.toLowerCase() === "alphatauri") {
        cleanName = "ToroRosso";
    }

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

    const absoluteFallback = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/F1_logo_red.svg/320px-F1_logo_red.svg.png";

    // Lanțul logic controlat de pași (0: PNG, 1: SVG, 2: JPG, 3: Online, 4: Generic F1)
    if (currentStep === 0) {
        imgElement.setAttribute("onerror", `handleTeamLogoError(this, '${teamName}', 1)`);
        imgElement.src = `/logos/${cleanName}.svg`;
    } else if (currentStep === 1) {
        imgElement.setAttribute("onerror", `handleTeamLogoError(this, '${teamName}', 2)`);
        imgElement.src = `/logos/${cleanName}.jpg`;
    } else if (currentStep === 2) {
        imgElement.setAttribute("onerror", `handleTeamLogoError(this, '${teamName}', 3)`);
        imgElement.src = onlineLogos[teamName] || absoluteFallback;
    } else {
        imgElement.onerror = null;
        imgElement.src = absoluteFallback;
    }
}

// Funcție universală de fallback pentru steaguri
function handleFlagError(imgElement, isoCode, currentStep) {
    const absoluteFlagFallback = "https://flagcdn.com/w160/un.png"; // Steagul ONU ca siguranță totală

    if (currentStep === 0) {
        imgElement.setAttribute("onerror", `handleFlagError(this, '${isoCode}', 1)`);
        imgElement.src = `/flags/${isoCode}.svg`;
    } else if (currentStep === 1) {
        imgElement.setAttribute("onerror", `handleFlagError(this, '${isoCode}', 2)`);
        imgElement.src = `https://flagcdn.com/w160/${isoCode}.png`;
    } else {
        imgElement.onerror = null;
        imgElement.src = absoluteFlagFallback;
    }
}

// --- FUNCȚII PENTRU GESTIONARE LOCALSTORAGE STATS ---
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

function renderStats() {
	const stats = getStats();
	
	// Calculare rată de câștig (%)
	const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
	
	// Afișăm numerele în căsuțele din popup
	if(document.getElementById('stat-played')) document.getElementById('stat-played').innerText = stats.played;
	if(document.getElementById('stat-winrate')) document.getElementById('stat-winrate').innerText = winRate + "%";
	if(document.getElementById('stat-streak')) document.getElementById('stat-streak').innerText = stats.streak;
	
	// Generăm graficul cu bare pentru încercări
	const distributionContainer = document.getElementById('guess-distribution');
	if (distributionContainer) {
		distributionContainer.innerHTML = '';
		
		// Găsim valoarea maximă pentru a scala barele vizual corect
		const maxDistributionValue = Math.max(...Object.values(stats.distribution), 1);
		
		for (let i = 1; i <= 6; i++) {
			const count = stats.distribution[i] || 0;
			// Lățimea barei în procente
			const barWidth = count > 0 ? Math.max(10, Math.round((count / maxDistributionValue) * 100)) : 8;
			
			const row = document.createElement('div');
			row.className = 'dist-row';
			row.innerHTML = `
				<div class="dist-label">${i}</div>
				<div class="dist-bar-container">
					<div class="dist-bar" style="width: ${barWidth}%;"> ${count} </div>
				</div>
			`;
			distributionContainer.appendChild(row);
		}
	}
}