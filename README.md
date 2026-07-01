# F1 Guesser Duel

**F1 Guesser Duel** este o aplicație web multiplayer, inspirată de jocurile de tip „guesser”, în care jucătorii trebuie să ghicească pilotul de Formula 1 corect pe baza indiciilor primite după fiecare încercare.

Aplicația rulează cu **Node.js**, **Express** și **Socket.IO**, iar interfața este construită cu **HTML**, **CSS** și **JavaScript vanilla**.

---

## Cuprins

- [Funcționalități](#funcționalități)
- [Cum funcționează jocul](#cum-funcționează-jocul)
- [Tehnologii folosite](#tehnologii-folosite)
- [Structura proiectului](#structura-proiectului)
- [Instalare și rulare locală](#instalare-și-rulare-locală)
- [Testare pe telefon](#testare-pe-telefon)
- [Moduri de dificultate](#moduri-de-dificultate)
- [Teme vizuale](#teme-vizuale)
- [Legendă culori](#legendă-culori)
- [Statistici locale](#statistici-locale)
- [Arhitectură](#arhitectură)
- [Optimizări implementate](#optimizări-implementate)
- [Direcții viitoare](#direcții-viitoare)

---

## Funcționalități

- Joc de ghicit piloți de Formula 1.
- Selectare clară între Single Play, Duel și Daily Challenge.
- Suport pentru camere multiplayer / duel prin link de room.
- Winner logic pe rundă în Duel: câștigătorul se decide după ce termină ambii playeri, după criteriile mai puține încercări → timp mai bun → remiză.
- Scoreboard persistent pe cameră pentru rundele de Duel.
- Lobby dedicat pentru Duel, cu jucători, spectatori și setări host-only.
- Alegere dificultate înainte de începerea rundei.
- Autocomplete pentru numele piloților.
- Feedback vizual după fiecare încercare.
- Maximum 6 încercări per rundă.
- Popup final pentru câștig sau pierdere.
- Restart rundă fără schimbarea camerei.
- Statistici locale salvate în browser.
- Teme vizuale multiple.
- Layout responsive pentru desktop și telefon.
- Asset-uri locale pentru steaguri și logo-uri de echipe.

---

## Cum funcționează jocul

1. Utilizatorul alege modul de joc: `Single Play`, `Duel` sau `Daily Challenge`.
2. În `Single Play`, jocul pornește fără cameră și fără adversar.
3. În `Duel`, aplicația creează sau folosește un room din URL, apoi sincronizează playerii/spectatorii prin Socket.IO.
4. În `Daily Challenge`, aplicația pornește provocarea zilei, separată de duel.
5. În `Duel`, hostul configurează dificultatea și timerul doar din lobby; Single/Daily folosesc overlay-ul lor dedicat.
6. Serverul selectează pilotul țintă din `data/drivers.json`.
7. Utilizatorul introduce un pilot și trimite ghicirea.
8. Serverul compară pilotul ales cu pilotul țintă.
9. Clientul primește doar rezultatul comparației, nu și răspunsul complet.
10. În `Single Play` și `Daily Challenge`, jocul se termină când pilotul este ghicit corect sau sunt epuizate cele 6 încercări.
11. În `Duel`, niciun player nu primește popup de câștig/pierdere până nu termină ambii playeri activi.
12. Câștigătorul rundei este decis după aceste criterii: mai puține încercări, apoi timp mai bun, apoi remiză dacă ambele sunt egale.
13. Scoreboard-ul de cameră se actualizează după calcularea rezultatului final și se păstrează la rematch.
14. La final se afișează popup-ul de rezultat și statisticile locale.

Răspunsul corect este ținut pe server până la finalul jocului, pentru a evita citirea lui directă din codul client-side.

---

## Tehnologii folosite

- **Node.js** – runtime JavaScript pentru server.
- **Express** – server HTTP și servire fișiere statice.
- **Socket.IO** – comunicare real-time între client și server.
- **HTML5** – structura aplicației.
- **CSS3** – layout, teme, responsive design și animații.
- **JavaScript vanilla** – logica din browser.
- **LocalStorage** – salvarea statisticilor locale.

---

## Structura proiectului

```text
f1guesserduel/
├── public/                 # Frontend: HTML, CSS, JS și asset-uri
├── server/                 # Backend Express + Socket.IO
├── test/                   # Teste unitare și E2E
├── scripts/                # Scripturi helper pentru testare
├── data/
│   └── drivers.json        # Baza de date cu piloți
├── .github/
│   └── CODEOWNERS          # Config GitHub pentru ownership
├── package.json            # Scripturi și dependențe Node.js
├── package-lock.json       # Versiuni exacte pentru dependențe
├── .env.example            # Exemplu de configurare runtime
├── .gitignore              # Fișiere ignorate de Git
├── F1GuesserDuel.bat       # Script Windows pentru pornire rapidă
├── F1GuesserDuel_Tests.bat # Script Windows pentru teste
├── F1GuesserDuel_cachyos.sh        # Script Linux/CachyOS pentru pornire
├── F1GuesserDuel_Tests_cachyos.sh  # Script Linux/CachyOS pentru teste
└── README.md               # Documentația proiectului
```

---

## Instalare și rulare locală

### 1. Clonează repository-ul

```bash
git clone https://github.com/HnarcisM/f1guesserduel.git
cd f1guesserduel
```

### 2. Instalează dependențele

```bash
npm install
```

### 3. Pornește aplicația

```bash
npm start
```

sau direct:

```bash
node server/index.js
```

### 4. Deschide aplicația în browser

```text
http://localhost:3000
```


---

## Configurare producție

Aplicația poate fi configurată prin variabile de mediu. Pentru rulare locală nu este obligatoriu să setezi nimic, dar pentru `NODE_ENV=production` trebuie să setezi cel puțin `SESSION_SECRET`.

| Variabilă | Default local | Descriere |
| --- | --- | --- |
| `NODE_ENV` | `development` | Folosește `production` pe server public. |
| `PORT` | `3000` | Portul pe care pornește aplicația. |
| `DATA_DIR` | `./data` | Folderul în care se salvează baza SQLite. |
| `SESSION_SECRET` | dev fallback local | Secret pentru sesiuni; obligatoriu în production. |
| `SOCKET_AUTH_SECRET` | `SESSION_SECRET` sau dev fallback | Secret pentru token-ul scurt folosit de socket auth refresh. |
| `SESSION_COOKIE_NAME` | `f1_session` | Numele cookie-ului de sesiune. |
| `SESSION_MAX_AGE_DAYS` | `7` | Durata sesiunii în zile. |
| `SOCKET_AUTH_TOKEN_MAX_AGE_MS` | `120000` | Durata token-ului temporar pentru socket refresh. |
| `SESSION_CLEANUP_INTERVAL_MS` | `900000` | Intervalul la care serverul curăță automat sesiunile expirate. |
| `ROOMS_FILE_PATH` | `<DATA_DIR>/rooms.json` | Fișierul JSON în care serverul salvează camerele active pentru restart. |
| `ROOM_SAVE_DEBOUNCE_MS` | `250` | Întârzierea de debounce pentru salvarea camerelor după modificări. |
| `COOKIE_SECURE` | `true` în production, altfel `false` | Trimite cookie-ul doar prin HTTPS. |
| `COOKIE_SAMESITE` | `lax` | Poate fi `lax`, `strict` sau `none`. |
| `TRUST_PROXY` | `false` | Setează `true` când rulezi în spatele unui proxy/load balancer. |

Validarea configului este strictă: dacă o variabilă este setată cu o valoare invalidă, serverul se oprește cu un mesaj clar. Reguli importante:

- `NODE_ENV` trebuie să fie `development`, `test` sau `production`;
- `PORT` trebuie să fie între `1` și `65535`;
- valorile numerice de durată/interval trebuie să fie întregi în limite rezonabile;
- `COOKIE_SECURE`, `TRUST_PROXY` acceptă doar valori de tip `true/false`, `1/0`, `yes/no`, `on/off`;
- `COOKIE_SAMESITE` trebuie să fie `lax`, `strict` sau `none`;
- `COOKIE_SAMESITE=none` cere obligatoriu `COOKIE_SECURE=true`;
- `SESSION_COOKIE_NAME` nu poate conține spații, semicolon sau separatori invalizi;
- path-urile configurate explicit nu pot fi stringuri goale.

Există și un fișier `.env.example` cu un exemplu de configurare. Aplicația nu încarcă automat `.env`, ca să nu adăugăm dependințe noi; setează variabilele direct în mediul de rulare sau folosește un loader extern dacă ai nevoie.

---

## Testare pe telefon

Pentru testare pe telefon real:

1. Pornește aplicația pe PC/laptop.
2. Asigură-te că telefonul și PC-ul sunt în aceeași rețea Wi-Fi.
3. Află IP-ul PC-ului.

Pe Windows:

```bash
ipconfig
```

Caută adresa IPv4, de exemplu:

```text
192.168.1.50
```

4. Intră de pe telefon în browser la:

```text
http://192.168.1.50:3000
```

Înlocuiește IP-ul cu adresa reală a calculatorului tău.

Dacă pagina nu se deschide, verifică firewall-ul Windows și permisiunile pentru Node.js.

---

## Moduri de dificultate

Aplicația include trei niveluri principale:

| Dificultate | Descriere |
| --- | --- |
| Easy | Piloți moderni, în general după 2010 |
| Medium | Piloți din perioada 2000–2010 |
| Hard | Piloți istorici, aproximativ 1950–2000 |

Dificultatea este trimisă către server, iar serverul filtrează lista din `data/drivers.json`.

---

## Teme vizuale

Aplicația include trei teme:

| Temă | Descriere |
| --- | --- |
| F1 Classic | Temă dark clasică |
| Night Race | Temă neon, inspirată de curse nocturne |
| Carbon & Checkers | Temă carbon, cu accente gri/antracit |

Tema Carbon a fost ajustată pentru contrast mai bun pe:

- butonul `Trimite`;
- sugestiile autocomplete;
- butonul `Joacă din nou`;
- barele de statistici.

---

## Legendă culori

După fiecare ghicire, jocul afișează indicii vizuale:

| Culoare | Semnificație |
| --- | --- |
| Verde | Potrivire perfectă |
| Galben | Echipa introdusă se află în istoricul pilotului țintă |
| Portocaliu | Valoarea corectă este mai mare |
| Violet | Valoarea corectă este mai mică |
| Roșu | Nu există potrivire |

Pentru câmpurile numerice precum vârsta, anul debutului și victoriile, săgețile indică dacă valoarea corectă este mai mare sau mai mică decât cea introdusă.

---

## Statistici locale

Statisticile sunt salvate local în browser, folosind `localStorage`.

Sunt urmărite:

- numărul total de jocuri;
- rata de câștig;
- streak-ul curent;
- distribuția încercărilor.

Aceste statistici sunt locale pentru fiecare browser/dispozitiv și nu sunt sincronizate între jucători.

---

## Arhitectură

### Server

Fișier principal: `server/index.js`

Responsabilități:

- servește aplicația din folderul `public`;
- creează și gestionează camerele de joc;
- ține pilotul țintă pe server;
- filtrează piloții după dificultate;
- validează ghicirile;
- trimite către client rezultatul comparației;
- gestionează restartul și deconectarea jucătorilor.

### Client

Fișier principal: `public/game.js`

Responsabilități:

- generează sau citește room-ul din URL;
- gestionează UI-ul de dificultate;
- gestionează autocomplete-ul;
- trimite ghicirile către server;
- randează gridul de rezultate;
- afișează popup-ul final;
- actualizează statisticile locale;
- gestionează temele și link-ul de share.

### Stiluri

Fișier principal: `public/style.css`

Responsabilități:

- layout general;
- teme vizuale;
- grid de joc;
- autocomplete;
- popup final;
- statistici;
- responsive design pentru telefon și tabletă.

---

## Optimizări implementate

### CSS

- Eliminare reguli duplicate.
- Mutare stiluri inline din HTML în CSS.
- Introducere variabile CSS pentru culori, spațieri, radius, umbre și tranziții.
- Uniformizare butoane.
- Uniformizare spacing și border-radius.
- Fixuri de contrast pentru tema Carbon.
- Responsive design pentru ecrane mici.

### JavaScript

- Eliminare `joinRoom` duplicat.
- Înlocuire `keyCode` cu `e.key`.
- Mutare stiluri directe în clase CSS.
- Reducere utilizare `innerHTML` unde nu era necesar.
- Helper-e pentru:
  - autocomplete;
  - randarea celulelor;
  - asset-uri flag/logo;
  - statistici locale.
- Organizare internă a fișierului `game.js` pe secțiuni clare.

### Asset-uri

- Flag-urile locale se încarcă direct ca `.svg`.
- Logo-urile echipelor folosesc extensia corectă când există local.
- Fallback-uri mai clare pentru flag-uri și logo-uri.

---

## Datele despre piloți

Piloții sunt definiți în `data/drivers.json`.

Fiecare pilot include informații precum:

- `id` – identificator unic;
- `name` – numele afișat;
- `nat` – naționalitatea;
- `team` – echipa sau istoricul echipelor;
- `age` – vârsta;
- `debut` – anul debutului;
- `wins` – numărul de victorii;
- `difficulty` – dificultatea în care apare pilotul.

Dacă se adaugă piloți noi, trebuie verificat ca valorile pentru naționalitate și echipă să aibă asset-uri corespunzătoare sau fallback corect.

---

## Recomandări pentru dezvoltare

Înainte de modificări majore:

```bash
git add .
git commit -m "Stable version before new changes"
```

După fiecare modificare importantă:

- testează o rundă câștigată;
- testează o rundă pierdută;
- testează restartul;
- verifică autocomplete-ul;
- verifică tema Carbon;
- verifică aplicația pe mobil;
- verifică consola browserului pentru erori.

Pentru verificare rapidă a sintaxei JavaScript:

```bash
node --check server/index.js
node --check public/game.js
```

---

## Direcții viitoare

Posibile îmbunătățiri:

- redesign vizual premium inspirat de interfețe F1 / timing screen;
- modernizare header;
- carduri de dificultate mai elegante;
- grid de joc mai apropiat de stilul broadcast F1;
- animații subtile pentru celule;
- leaderboard per cameră;
- mod single-player separat;
- istoric runde;
- scor pentru duel;
- separarea `game.js` în module mai mici;
- teste automate pentru logica serverului.

---

## Status proiect

Versiunea curentă este stabilă după refactorizări CSS și JavaScript.

Aplicația este pregătită pentru următoarea etapă: **redesign vizual controlat**, păstrând funcționalitatea existentă.

# F1 Guesser — sistem de dificultate pentru piloți

Acest fișier explică modul în care este ales câmpul `difficulty` din `drivers.hybrid-difficulty.json`.

## De ce nu folosim doar anul de debut?

O sortare strictă după debut nu este suficientă pentru joc. De exemplu:

- Lewis Hamilton a debutat în 2007, dar este încă un pilot actual și foarte ușor de recunoscut.
- Fernando Alonso a debutat în 2001, dar este încă relevant pentru grila modernă.
- Ayrton Senna, Alain Prost sau Niki Lauda sunt piloți istorici, dar sunt legende foarte cunoscute și nu ar trebui tratați ca piloți obscuri.

Din acest motiv folosim un sistem hibrid: relevanță actuală + notorietate + epocă.

## Regula generală

### `easy`

Categoria `easy` include:

1. Toți piloții actuali din grila curentă folosită în joc.
2. Campioni mondiali moderni.
3. Piloți moderni foarte cunoscuți sau foarte ușor de recunoscut.
4. Piloți post-2010 cu victorii importante sau notorietate mare.

Exemple:

```text
Hamilton, Alonso, Verstappen, Leclerc, Norris, Piastri, Russell,
Sainz, Perez, Bottas, Vettel, Raikkonen, Rosberg, Button,
Ricciardo, Massa, Webber, Barrichello, Coulthard
```

### `medium`

Categoria `medium` include:

1. Piloți moderni cunoscuți, dar nu neapărat mainstream.
2. Piloți din perioada 2000–2010 cu cariere relevante.
3. Legende istorice foarte cunoscute, care sunt grele pentru un jucător nou, dar nu sunt obscure.

Exemple:

```text
Kubica, Kovalainen, Trulli, Heidfeld, Fisichella,
Senna, Prost, Lauda, Fangio, Mansell, Jim Clark, Jackie Stewart
```

### `hard`

Categoria `hard` include:

1. Piloți istorici mai puțin cunoscuți.
2. Piloți cu cariere scurte sau foarte puține curse.
3. Piloți obscuri, chiar dacă sunt relativ moderni.
4. Piloți greu de identificat după echipă, naționalitate sau statistici.

Exemple:

```text
Yuji Ide, Gaston Mazzacane, Tarso Marques, Nicolas Kiesa,
Ralph Firman, Patrick Friesacher, Tomas Enge, Alex Yoong,
Luciano Burti
```

## Principiu de întreținere

Când se adaugă un pilot nou:

1. Dacă este pilot actual, intră în `easy`.
2. Dacă este campion mondial modern sau foarte cunoscut, intră în `easy`.
3. Dacă este pilot modern secundar, intră în `medium`.
4. Dacă este legendă istorică foarte cunoscută, intră în `medium`.
5. Dacă este pilot istoric obscur sau cu carieră foarte scurtă, intră în `hard`.

## Rezumat actual

```text
Total piloți: 166
easy: 36
medium: 86
hard: 44
```

## Validare tehnică

```text
ID-uri duplicate: nu există
Câmpuri lipsă: nu există
Difficulty invalide: nu există
```

## Observație importantă

Fișierul JSON nu conține comentarii la început, deoarece comentariile fac JSON-ul invalid și pot strica încărcarea aplicației.
Explicația sistemului este păstrată în acest README.


## Pornire server și teste

### Windows

Pentru pornirea jocului/serverului:

```bat
F1GuesserDuel.bat
```

Pentru rularea testelor backend + E2E cu browser real:

```bat
F1GuesserDuel_Tests.bat
```

### CachyOS / Arch Linux

Pentru pornirea jocului/serverului:

```bash
./F1GuesserDuel_cachyos.sh
```

Pentru rularea testelor backend + E2E cu browser real:

```bash
./F1GuesserDuel_Tests_cachyos.sh
```

Launcher-ul normal al jocului instalează doar dependențele necesare serverului. Dependențele pentru testele E2E și browserul Playwright Chromium sunt pregătite doar de scripturile de test, ca pornirea jocului să nu fie blocată de testele E2E.

În timpul testelor E2E apar mesaje de progres de forma `[E2E ora] ...`, ca să fie clar dacă testul încă lucrează sau la ce pas s-a oprit.


## Daily Challenge

Daily Challenge adaugă o provocare zilnică separată pe dificultate:

- `Daily Easy`
- `Daily Medium`
- `Daily Hard`

Pentru fiecare dificultate, serverul alege determinist același pilot pentru aceeași zi calendaristică UTC. Nu este nevoie de bază de date pentru prima versiune: seed-ul este calculat din dată și dificultate. Daily Challenge poate fi pornit din overlay-ul principal sau din meniul hamburger. Este tratat ca mod separat de `Single Play` și `Duel`, astfel încât nu activează camera, spectator board-ul sau viitorul scoreboard de duel.


## Daily Challenge reset

Daily Challenge se resetează la miezul nopții local al browserului și este blocat separat per cont, dificultate și zi.

## Test launcher progress

`F1GuesserDuel_Tests.bat` afișează mesaje `[progress]` pentru comenzile lungi, inclusiv `npm install`, instalarea Chromium Playwright și testele E2E.


### Structură frontend pe moduri de joc

Frontend-ul are un controller dedicat pentru modul de joc curent:

```text
public/js/gameModeController.js
```

Modurile definite sunt:

```text
single  - joc individual normal
duel    - joc în cameră cu playeri/spectatori
daily   - Daily Challenge individual
```

Ecranul inițial permite acum alegerea explicită a modului. Aplicația pornește implicit în `single`, creează/join-uiește camera doar când alegi `duel` sau intri direct pe un link cu `?room=...`, iar `daily` rămâne separat de ambele.

Această separare este fundația pentru feature-urile de cameră: winner logic pe rundă, scoreboard pe cameră, lobby, ready system și Daily Challenge server-side.


### Lobby Duel

În modul `Duel`, camera are un lobby separat de Single/Daily:

```text
- lobby-ul apare doar în mode-duel;
- afișează Player 1, Player 2, spectatorii și hostul;
- doar hostul poate modifica dificultatea și timerul;
- spectatorii pot vedea lobby-ul, dar nu pot interacționa cu setările;
- dropdown-ul hamburger nu mai schimbă dificultatea/timerul în Duel; setările se fac doar din lobby;
- când o rundă activă este oprită intenționat, camera revine în lobby și scorul se păstrează.
```

### Winner logic și scoreboard în Duel

În modul `Duel`, winner logic-ul este decis server-side:

```text
- rezultatul se calculează doar după ce toți playerii activi au terminat;
- câștigă playerul care a ghicit corect în mai puține încercări;
- dacă numărul de încercări este egal, câștigă playerul care a terminat mai repede;
- dacă și numărul de încercări, și timpul sunt egale, runda este remiză;
- dacă nimeni nu ghicește corect, runda este remiză;
- scorul camerei se incrementează o singură dată, după calcularea rezultatului final;
- rematch-ul păstrează scorul camerei și resetează doar runda.
```

Scoreboard-ul este vizibil în modul Duel și este inclus în starea publică a camerei fără să expună `socketId` sau `userId`.

### Reguli de siguranță în Duel

În timpul unei runde active de `Duel`, setările rundei sunt blocate:

```text
- dificultatea nu poate fi schimbată;
- timerul nu poate fi schimbat;
- hostul trebuie să aștepte finalul rundei pentru setările următoare.
```

Dacă un player încearcă să revină la Home / meniul principal în timpul unei runde active, aplicația cere confirmare. Dacă playerul confirmă, runda este oprită pentru toți jucătorii, camera rămâne activă, scorul se păstrează și ambele părți revin în lobby-ul camerei pentru o rundă nouă.

Dacă un player dă refresh accidental în timpul unei runde active, aplicația tratează refresh-ul ca reconnect, nu ca reset:

```text
- browserul afișează warning nativ înainte de refresh;
- după refresh, același tab revine în aceeași cameră;
- încercările și guess-urile deja făcute sunt restaurate;
- playerul nu primește încercări noi;
- dacă terminase deja runda, rămâne în starea de așteptare a rezultatului final.
```

### Progres adversar după ce ai terminat runda

În `Duel`, dacă un player termină înaintea celuilalt, nu primește imediat popup de rezultat. În schimb, vede un panel de așteptare cu progresul adversarului:

```text
- numele adversarului;
- status: încă joacă / a terminat / timp expirat;
- încercări folosite din 6;
- timpul rămas, dacă runda are timer.
```

Panelul nu afișează piloții ghiciți de adversar. Rezultatul final și scoreboard-ul apar doar după ce ambii playeri activi au terminat runda.
