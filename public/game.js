// Global, ca să poată fi accesat în siguranță
let socket;

document.addEventListener("DOMContentLoaded", () => {
    // Încercăm să conectăm socket-ul în siguranță, fără să crăpăm dacă serverul e oprit
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

    const linkTextEl = document.getElementById("linkText");
    if (linkTextEl) linkTextEl.innerText = window.location.href;

    if (socket) {
        socket.emit('joinRoom', roomId);
    }

    // --- LEGAREA BUTOANELOR (Rulează garantat acum, indiferent de erori) ---
    document.querySelectorAll(".btn-diff").forEach(button => {
        button.addEventListener("click", function() {
            const level = this.getAttribute("data-level");
            const overlay = document.getElementById('difficulty-overlay');
            if (overlay) overlay.classList.add('hidden');
            
            console.log("S-a apasat dificultatea:", level);
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
        if (e.target.id !== "driverInput") {
            const sug = document.getElementById("suggestions");
            if (sug) sug.innerHTML = "";
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
        li.onclick = () => {
            const inputEl = document.getElementById("driverInput");
            if (inputEl) inputEl.value = driver.name;
            selectedDriverId = driver.id;
            listContainer.innerHTML = "";
            currentFocus = -1;
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

// Evenimentele asunse Socket se mută aici pentru siguranță
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
        const { guess, target, isWin, attempts } = data;
        let rowIndex = attempts - 1; 

        let c0 = document.getElementById(`cell-${rowIndex}-0`);
        if (!c0) return; 
        
        c0.className = `cell ${guess.id === target.id ? 'green' : 'red'}`;
        c0.style.flexDirection = "column";
        c0.style.lineHeight = "1.2";
        c0.style.padding = "5px 2px";
        c0.innerHTML = `
            <span style="font-size: 14px; font-weight: bold; display: block;">${guess.id}</span>
            <span style="font-size: 9px; font-weight: normal; text-transform: none; color: rgba(255,255,255,0.85); display: block;">${guess.name}</span>
        `;

        let c1 = document.getElementById(`cell-${rowIndex}-1`);
        if (c1) { c1.className = `cell ${guess.nat === target.nat ? 'green' : 'red'}`; c1.innerText = guess.nat; }
        
        let currentGuessTeam = guess.team[0];
        let teamClass = 'red';
        if (target.team.includes(currentGuessTeam)) {
            teamClass = (currentGuessTeam === target.team[0]) ? 'green' : 'yellow';
        }
        
        let c2 = document.getElementById(`cell-${rowIndex}-2`);
        if (c2) { c2.className = `cell ${teamClass}`; c2.innerText = currentGuessTeam.substring(0,5); }
        
        let ageClass = target.age > guess.age ? 'orange' : (target.age < guess.age ? 'purple' : 'green');
        let c3 = document.getElementById(`cell-${rowIndex}-3`);
        if (c3) { c3.className = `cell ${ageClass}`; c3.innerText = guess.age; }
        
        let debutClass = target.debut > guess.debut ? 'orange' : (target.debut < guess.debut ? 'purple' : 'green');
        let c4 = document.getElementById(`cell-${rowIndex}-4`);
        if (c4) { c4.className = `cell ${debutClass}`; c4.innerText = guess.debut; }
        
        let winsClass = target.wins > guess.wins ? 'orange' : (target.wins < guess.wins ? 'purple' : 'green');
        let c5 = document.getElementById(`cell-${rowIndex}-5`);
        if (c5) { c5.className = `cell ${winsClass}`; c5.innerText = guess.wins; }

        if (isWin) {
            document.getElementById("gameZone").style.display = "none";
            document.getElementById("status").style.display = "none";
            document.getElementById("endGameTitle").innerText = "🏆 AI CÂȘTIGAT!";
            document.getElementById("endGameMessage").innerHTML = `Ai descoperit pilotul misterios în <strong>${attempts}</strong> ${attempts === 1 ? 'încercare' : 'încercări'}!`;
            document.getElementById("endGameDisplay").className = "end-game-popup show";
        } else if (attempts >= 6) {
            document.getElementById("gameZone").style.display = "none";
            document.getElementById("status").style.display = "none";
            document.getElementById("endGameTitle").innerText = "💀 AI PIERDUT!";
            document.getElementById("endGameMessage").innerHTML = `Din păcate nu ai ghicit. Pilotul misterios era: <strong>${target.name}</strong>`;
            document.getElementById("endGameDisplay").className = "end-game-popup show";
        }
    });

    socket.on('gameRestarted', () => {
        initializeGridStructure();
        document.getElementById("endGameDisplay").className = "end-game-popup";
        document.getElementById("gameZone").style.display = "block";
        document.getElementById("status").style.display = "block";
        document.getElementById("status").innerText = "Ghicește noul pilot misterios!";
        selectedDriverId = null;
        currentFocus = -1;
    });
}