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
- [Testare locală și E2E](#testare-locală-și-e2e)
- [Configurare producție](#configurare-producție)
- [Build frontend](#build-frontend)
- [Creare release ZIP curat](#creare-release-zip-curat)
- [Testare pe telefon](#testare-pe-telefon)
- [Moduri de dificultate](#moduri-de-dificultate)
- [Teme vizuale](#teme-vizuale)
- [Legendă culori](#legendă-culori)
- [Statistici](#statistici)
- [Arhitectură](#arhitectură)
- [Optimizări implementate](#optimizări-implementate)
- [Recomandări pentru dezvoltare](#recomandări-pentru-dezvoltare)
- [Status și roadmap](#status-și-roadmap)

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
- Statistici locale pentru Guest și statistici de cont persistente în PostgreSQL.
- Conturi și sesiuni persistente în Postgres extern pentru deploy free pe Render + Neon.
- Teme vizuale multiple.
- Layout responsive pentru desktop și telefon.
- Asset-uri locale pentru steaguri și logo-uri de echipe.
- Daily Challenge separat per cont, dificultate și zi locală a browserului.

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
14. La final se afișează popup-ul de rezultat; pentru utilizatorii autentificați, rezultatul validat de server actualizează și statisticile persistente ale contului.

Răspunsul corect este ținut pe server până la finalul jocului, pentru a evita citirea lui directă din codul client-side.

---

## Tehnologii folosite

- **Node.js** – runtime JavaScript pentru server.
- **Express** – server HTTP și servire fișiere statice.
- **Socket.IO** – comunicare real-time între client și server.
- **HTML5** – structura aplicației.
- **CSS3** – layout, teme, responsive design și animații.
- **JavaScript vanilla** – logica din browser.
- **LocalStorage** – salvarea statisticilor Guest locale.
- **SQLite / PostgreSQL** – stocare conturi, sesiuni și statistici de cont, configurabilă prin `DATABASE_PROVIDER`.
- **Redis** – persistența camerelor și rate limiting distribuit, când este configurat.
- **esbuild** – bundle-uri CSS/JavaScript minificate și versionate prin hash.
- **Playwright, axe-core și sharp** – E2E, accesibilitate și regresie vizuală.
- **Node test runner și c8** – teste unitare, integrare și coverage cu praguri CI.
- **prom-client** – metrici operaționale Prometheus/OpenMetrics protejate cu Bearer token.

---

## Structura proiectului

```text
f1guesserduel/
├── public/                 # Frontend, module CSS/JS și asset-uri
├── server/                 # Backend Express, Socket.IO și persistență
├── test/                   # Teste unitare, integrare, E2E și baseline-uri
├── scripts/                # Build, optimizare, release și setup Playwright
├── data/
│   └── drivers.json        # Baza de date cu piloți
├── .github/
│   ├── CODEOWNERS          # Ownership
│   └── workflows/ci.yml    # Teste, servicii reale, build și audituri browser
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

Launcherele `F1GuesserDuel.bat` și `F1GuesserDuel_cachyos.sh` oferă pornire
rapidă pe Windows, respectiv CachyOS/Arch Linux. Variantele cu `_Tests` pregătesc
și rulează suitele backend plus E2E.

### 4. Deschide aplicația în browser

```text
http://localhost:3000
```


---

## Testare locală și E2E

### Teste backend/unitare

```bash
npm test
```

### Coverage cu praguri minime

```bash
npm run test:coverage
```

Raportul include toate fișierele JavaScript din `server/`, `public/js/` și
`scripts/`, inclusiv fișierele neexecutate de teste. CI-ul impune minimum 65%
pentru statements și linii, 70% pentru ramuri și 75% pentru funcții. Sumarul
JSON este generat în `test-results/coverage/coverage-summary.json`.

### Teste de integrare Redis și PostgreSQL

```bash
TEST_REDIS_URL=redis://127.0.0.1:6379 \
TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/f1guesser_test \
npm run test:integration:services
```

Comanda folosește servicii reale și validează migrațiile PostgreSQL, repository-urile
de autentificare și statistici, persistența camerelor Redis, TTL-ul cheilor și rate
limiting-ul distribuit. Folosește numai instanțe dedicate testării, deoarece sunt
aplicate migrările bazei de date. Testele unitare obișnuite nu necesită aceste servicii.

### Setup Playwright pentru E2E

După `npm install`, instalează browserul Chromium folosit de Playwright:

```bash
npm run test:e2e:install
```

Aliasul vechi rămâne disponibil:

```bash
npm run e2e:install
```

### Teste E2E

```bash
npm run test:e2e
```

`npm run test:e2e` verifică automat Chromium înainte de rulare, prin scriptul `pretest:e2e`. Dacă browserul lipsește, încearcă să îl instaleze și oprește testele cu mesaj clar dacă instalarea eșuează.

Pentru a rula doar matricea responsive și vizuală:

```bash
npm run test:e2e:responsive
```

Suita verifică pagina de start și starea de joc pe telefon, Galaxy Fold 5 (cover și ecran interior în ambele orientări) și desktop. Detectează automat overflow-ul lateral, elementele ieșite din viewport și suprapunerile importante, apoi compară pixel cu pixel capturile cu baseline-urile versionate din `test/e2e/baselines/responsive-visual/`. Capturile curente, raportul geometric și imaginile diff pentru regresii sunt scrise în `test-results/responsive-visual/`.

Baseline-urile oficiale se regenerează numai după aprobarea unei schimbări vizuale intenționate, folosind inputul manual `update_visual_baselines` al workflow-ului GitHub Actions `CI`. Artefactul `visual-baselines-<run_attempt>` este generat pe imaginea fixată `ubuntu-24.04` și poate înlocui conținutul din `test/e2e/baselines/responsive-visual/`.

Comanda locală este disponibilă pentru previzualizare, dar rezultatele se comit numai dacă mediul reproduce browserul și fonturile din CI:

```bash
UPDATE_VISUAL_BASELINES=1 npm run test:e2e:responsive
```

Pentru profilul autentificat și reconectarea Duel după refresh:

```bash
npm run test:e2e:flows
```

Aceste scenarii verifică persistența avatarului și username-ului, sesiunea după
reload, păstrarea rolului și restaurarea încercărilor deja trimise într-un Duel.

Pentru auditul automat de accesibilitate pe ecranele și stările aplicației:

```bash
npm run test:e2e:accessibility
```

Auditul axe verifică în toate cele trei teme pagina principală, meniul, fluxurile
Single, Daily și Duel, perspectiva spectatorului, dialogul de rezultat, login-ul,
înregistrarea și toate secțiunile profilului autentificat. Raportul JSON complet
este salvat în `test-results/accessibility/axe-report.json`.

### Toate testele

```bash
npm run test:all
```

### Verificare automată în GitHub Actions

Workflow-ul `.github/workflows/ci.yml` rulează automat la fiecare `push` și
`pull_request`, folosind Node.js 22. Verificarea instalează versiunile exacte din
`package-lock.json`, rulează testele cu pragurile minime de coverage, păstrează
sumarul coverage ca artefact, generează bundle-urile de producție și eșuează dacă
`public/index.html`, `public/style.bundle.css` sau `public/game.bundle.min.js` nu
sunt actualizate în commit. În paralel, un job izolat pornește containere Redis și
PostgreSQL cu health checks și rulează testele reale de integrare. După aceste
verificări, jobul browser instalează Chromium, rulează suitele responsive/vizuală,
profil/reconectare și de accesibilitate și păstrează rapoartele ca artefacte timp
de 14 zile.

Pentru a reoptimiza numai SVG-urile folosite de build-ul de producție:

```bash
npm run optimize:svg
```

Scriptul folosește SVGO în mod conservator, păstrează `viewBox`, dimensiunile și ID-urile interne și nu rescrie un fișier dacă rezultatul nu este mai mic. Pentru inventarul complet, inclusiv activele momentan nefolosite, poate fi rulat manual cu `npm run optimize:svg -- --all`.

Pentru a regenera variantele WebP ale logo-urilor raster folosite în producție:

```bash
npm run optimize:raster
```

Scriptul păstrează varianta WebP numai dacă are aceleași dimensiuni, este mai mică și abaterea vizuală normalizată RMSE nu depășește `0,5%`, verificată atât pe fundal deschis, cât și pe fundal închis. Fișierele sursă PNG/JPG rămân în proiect pentru regenerare și rollback, iar o rulare repetată nu rescrie fișiere identice.

Detalii suplimentare pentru scenariile E2E sunt în `test/e2e/README.md`.

---

## Configurare producție

Aplicația poate fi configurată prin variabile de mediu. Pentru rulare locală nu este obligatoriu să setezi nimic, dar pentru `NODE_ENV=production` trebuie să setezi cel puțin `SESSION_SECRET`.

| Variabilă | Default local | Descriere |
| --- | --- | --- |
| `NODE_ENV` | `development` | Folosește `production` pe server public. |
| `PORT` | `3000` | Portul pe care pornește aplicația. |
| `PERSISTENCE_MODE` | `local` în development, inferat în production | Modul de persistență: `local`, `ephemeral` sau `persistent`. Pentru Render Free folosește `ephemeral`. |
| `DATA_DIR` | `./data` | Folder local pentru SQLite/rooms.json. Pe Render Free rămâne efemer. |
| `DATABASE_PROVIDER` | `sqlite` | Provider DB pentru conturi/sesiuni: `sqlite` sau `postgres`. |
| `DATABASE_URL` | none | Connection string Postgres, obligatoriu când `DATABASE_PROVIDER=postgres`. |
| `POSTGRES_SSL` | `true` | Activează SSL pentru Postgres extern, recomandat pentru Neon/hosting cloud. |
| `POSTGRES_POOL_MAX` | `5` | Numărul maxim de conexiuni PostgreSQL deschise simultan de proces. |
| `POSTGRES_CONNECTION_TIMEOUT_MS` | `15000` | Timpul maxim de așteptare pentru deschiderea unei conexiuni PostgreSQL. |
| `POSTGRES_IDLE_TIMEOUT_MS` | `30000` | Închide conexiunile nefolosite după acest interval. |
| `POSTGRES_QUERY_TIMEOUT_MS` | `20000` | Limita client/server pentru o interogare PostgreSQL. |
| `POSTGRES_INIT_RETRY_ATTEMPTS` | `3` | Numărul total de încercări la pornire pentru erori PostgreSQL tranzitorii. |
| `POSTGRES_INIT_RETRY_BASE_DELAY_MS` | `1000` | Întârzierea inițială pentru retry; următoarele încercări folosesc backoff exponențial. |
| `POSTGRES_KEEP_ALIVE_INITIAL_DELAY_MS` | `10000` | Activează TCP keepalive după această perioadă pentru conexiunile PostgreSQL. |
| `POSTGRES_MAX_LIFETIME_SECONDS` | `300` | Reciclează controlat conexiunile vechi din pool; `0` dezactivează limita. |
| `POSTGRES_MIGRATIONS_DIR` | `server/db/migrations/postgres` | Directorul cu migrările PostgreSQL numerotate. În mod normal nu trebuie suprascris. |
| `DB_FILE_PATH` | `<DATA_DIR>/f1guesser.sqlite` | Path SQLite local, folosit doar când `DATABASE_PROVIDER=sqlite`. |
| `SESSION_SECRET` | dev fallback local | Secret pentru sesiuni; obligatoriu în production. |
| `SOCKET_AUTH_SECRET` | `SESSION_SECRET` sau dev fallback | Secret pentru token-ul scurt folosit de socket auth refresh. |
| `SESSION_COOKIE_NAME` | `f1_session` | Numele cookie-ului de sesiune. |
| `SESSION_MAX_AGE_DAYS` | `7` | Durata sesiunii în zile. |
| `SOCKET_AUTH_TOKEN_MAX_AGE_MS` | `120000` | Durata token-ului temporar pentru socket refresh. |
| `SESSION_CLEANUP_INTERVAL_MS` | `900000` | Intervalul la care serverul curăță automat sesiunile expirate. |
| `ROOMS_FILE_PATH` | `<DATA_DIR>/rooms.json` | Fișierul JSON în care serverul salvează camerele active pentru restart. |
| `ROOM_SAVE_DEBOUNCE_MS` | `250` | Întârzierea de debounce pentru salvarea asincronă a camerelor după modificări. |
| `ROOM_CLEANUP_INTERVAL_MS` | `60000` | Intervalul verificării camerelor inactive; `0` dezactivează jobul periodic. |
| `ROOM_INACTIVE_TTL_MS` | `1800000` | Șterge o cameră după 30 de minute fără niciun socket activ. |
| `REDIS_URL` | none | URL `redis://`/`rediss://`. Când există, activează persistența camerelor în chei Redis separate și rate limiting distribuit pentru Socket.IO, login și register. |
| `REDIS_KEY_PREFIX` | `f1guesserduel` | Prefix izolat pentru cheile Redis ale aplicației. |
| `REDIS_CONNECT_TIMEOUT_MS` | `10000` | Timp maxim pentru conectarea inițială la Redis. |
| `REDIS_ROOM_TTL_SECONDS` | `86400` | TTL-ul fiecărei camere Redis, reînnoit numai când camera respectivă este salvată. |
| `COOKIE_SECURE` | `true` în production, altfel `false` | Trimite cookie-ul doar prin HTTPS. |
| `COOKIE_SAMESITE` | `lax` | Poate fi `lax`, `strict` sau `none`. |
| `TRUST_PROXY` | `false` | Setează `true` când rulezi în spatele unui proxy/load balancer. |
| `PUBLIC_ORIGIN` | none | Origin-ul public autorizat pentru Socket.IO și cererile HTTP sensibile protejate CSRF, de exemplu `https://numele-serviciului.onrender.com`. |
| `SOCKET_ALLOWED_ORIGINS` | localhost automat în development | Origini suplimentare autorizate pentru Socket.IO și protecția CSRF, separate prin virgulă. |
| `SOCKET_RATE_LIMIT_ENABLED` | `true` | Activează protecția anti-spam pentru event-urile Socket.IO sensibile. |
| `SOCKET_RATE_LIMIT_WINDOW_MS` | `60000` | Fereastra de timp pentru limitele Socket.IO, în milisecunde. |
| `LOG_LEVEL` | `debug` local, `info` production | Nivelul minim de log: `silent`, `error`, `warn`, `info`, `debug`. |
| `REQUEST_LOGGING_ENABLED` | `false` local, `true` production | Activează logurile HTTP pe request-uri, fără body/query string. |
| `METRICS_ENABLED` | `false` | Activează endpoint-ul operațional protejat `GET /metrics`. |
| `METRICS_TOKEN` | none | Bearer token separat, de minimum 32 de caractere, obligatoriu când metricile sunt active. |
| `METRICS_INCLUDE_PROCESS` | `true` | Include metricile standard Node.js pentru CPU, memorie și event loop. |

Validarea configului este strictă: dacă o variabilă este setată cu o valoare invalidă, serverul se oprește cu un mesaj clar. Reguli importante:

- `NODE_ENV` trebuie să fie `development`, `test` sau `production`;
- `PERSISTENCE_MODE` poate fi `local`, `ephemeral` sau `persistent`;
- `DATABASE_PROVIDER` poate fi `sqlite` sau `postgres`;
- `DATABASE_URL` este obligatoriu când `DATABASE_PROVIDER=postgres`;
- în production, SQLite este refuzat când `PERSISTENCE_MODE=ephemeral` sau fișierul bazei se află în `/tmp`/`/var/tmp`;
- pool-ul PostgreSQL acceptă maximum `1-50` conexiuni, `1-10` încercări de inițializare, iar timeout-urile configurabile sunt validate strict;
- `PORT` trebuie să fie între `1` și `65535`;
- valorile numerice de durată/interval trebuie să fie întregi în limite rezonabile;
- `COOKIE_SECURE`, `TRUST_PROXY` acceptă doar valori de tip `true/false`, `1/0`, `yes/no`, `on/off`;
- `COOKIE_SAMESITE` trebuie să fie `lax`, `strict` sau `none`;
- cererile care modifică profilul, parola, avatarul sau sesiunile sunt acceptate numai de la originile configurate prin `PUBLIC_ORIGIN` / `SOCKET_ALLOWED_ORIGINS`;
- `COOKIE_SAMESITE=none` cere obligatoriu `COOKIE_SECURE=true`;
- `SESSION_COOKIE_NAME` nu poate conține spații, semicolon sau separatori invalizi;
- path-urile configurate explicit nu pot fi stringuri goale;
- origin-urile Socket.IO trebuie să fie URL-uri `http`/`https` fără path, query sau hash;
- `SOCKET_RATE_LIMIT_WINDOW_MS` trebuie să fie între `1000` și `3600000`;
- `REDIS_URL`, dacă este setat, trebuie să fie un URL `redis://` sau `rediss://`, iar prefixul Redis acceptă numai litere, cifre, `.`, `_`, `-` și `:`;
- `LOG_LEVEL` trebuie să fie `silent`, `error`, `warn`, `info` sau `debug`.
- `METRICS_ENABLED=true` cere un `METRICS_TOKEN` separat de minimum 32 de caractere.

Există și un fișier `.env.example` cu un exemplu de configurare. Aplicația nu încarcă automat `.env`, ca să nu adăugăm dependințe noi; setează variabilele direct în mediul de rulare sau folosește un loader extern dacă ai nevoie.

Pentru Render, repo-ul include și:

- `DEPLOYMENT.md` cu pașii compleți de publicare;
- `render.yaml` pentru Blueprint opțional;
- setări recomandate pentru `NODE_ENV=production`, cookie securizat, proxy, health check și `PUBLIC_ORIGIN` pentru Socket.IO.

Pe Render Free, folosește `PERSISTENCE_MODE=ephemeral` și `DATA_DIR=/tmp/f1guesserduel` numai împreună cu Postgres pentru conturi și sesiuni. Aplicația refuză intenționat să pornească în production cu SQLite pe stocare efemeră, pentru a preveni pierderea silențioasă a conturilor. `/api/health` afișează `persistence.mode`, providerul bazei, versiunea, mediul, uptime-ul și check-uri non-sensibile pentru `database`, `drivers` și `rooms`. Pentru persistent disk plătit, setează `PERSISTENCE_MODE=persistent` și mută `DATA_DIR`, `DB_FILE_PATH` și `ROOMS_FILE_PATH` în `/var/data`.

### Conturi persistente pe Render Free cu Neon Postgres

Pentru a păstra conturile după redeploy pe Render Free, folosește un Postgres extern și setează în Render:

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
POSTGRES_SSL=true
PERSISTENCE_MODE=ephemeral
```

În această variantă, `users` și `sessions` sunt salvate în Postgres. Fără `REDIS_URL`, camerele active rămân în `rooms.json` efemer; cu Redis activ, fiecare cameră este păstrată compact într-o cheie proprie și poate fi restaurată după restart/redeploy/sleep.

### Redis opțional pentru camere și rate limiting

Pentru un serviciu Redis extern, adaugă în mediul de deploy:

```env
REDIS_URL=rediss://default:password@host:port
REDIS_KEY_PREFIX=f1guesserduel
REDIS_CONNECT_TIMEOUT_MS=10000
REDIS_ROOM_TTL_SECONDS=86400
```

O singură configurare `REDIS_URL` activează două mecanisme:

- camerele sunt păstrate asincron în chei Redis separate, cu debounce și TTL individual; o modificare rescrie numai camera afectată, iar jucătorii și identificatorii socket nu sunt salvați;
- limitele Socket.IO sunt numărate atomic în Redis, pe utilizator autentificat sau adresă anonimă;
- încercările HTTP de login și înregistrare sunt numărate atomic per adresă IP, în chei Redis separate și anonimizate. Limitele nu se resetează la fiecare proces nou și funcționează între mai multe procese.

Dacă `REDIS_URL` lipsește, aplicația păstrează automat comportamentul anterior: fișierul `rooms.json` și rate limiting în memoria procesului. O eroare de conectare inițială la Redis oprește pornirea, evitând un fallback silențios care ar putea pierde starea. Dacă Redis devine temporar indisponibil după pornire, rate limiting-ul revine la contoare locale în memorie, logurile de eroare sunt limitate, iar `/api/health` devine `degraded`.

Cheile Redis separate permit restaurarea camerelor pentru o singură instanță și evită rescrierea întregului set la fiecare modificare. La prima pornire după upgrade, vechea cheie `<prefix>:rooms:snapshot` este migrată automat și eliminată numai după ce noile chei au fost salvate. Sincronizarea live a event-urilor și camerelor între mai multe instanțe necesită separat un adapter Socket.IO Redis; această versiune nu declară încă suport complet multi-instance pentru dueluri live.

Un job periodic verifică o dată pe minut camerele din memorie. Când o cameră nu mai are niciun socket activ, începe un interval de inactivitate; camera este eliminată după 30 de minute. Reconectarea anulează intervalul, iar membrii deconectați beneficiază în continuare de fereastra de reconectare existentă. Ștergerea folosește providerul activ, deci elimină și cheia Redis individuală sau actualizează `rooms.json`.

### Migrații PostgreSQL versionate

La pornire, serverul citește fișierele din `server/db/migrations/postgres` în ordine numerică. `001_initial_auth_schema.sql` creează autentificarea, iar `002_account_game_stats.sql` adaugă statisticile persistente.

- migrările aplicate sunt înregistrate în tabela `schema_migrations` cu versiune, nume, checksum și timestamp;
- întregul lot rulează într-o tranzacție și este anulat prin rollback dacă o comandă eșuează;
- un advisory lock PostgreSQL împiedică două instanțe să aplice aceeași migrare simultan;
- o migrare deja aplicată nu trebuie modificată: checksum-ul diferit oprește pornirea cu o eroare clară;
- pentru o schimbare nouă se adaugă un fișier precum `002_add_profile_fields.sql`, fără editarea migrărilor vechi.

La primul deploy peste baza existentă, migrarea `001` folosește operații `IF NOT EXISTS`, apoi înregistrează versiunea fără să șteargă utilizatori sau sesiuni. Nu este necesară nicio variabilă Render suplimentară.

### Panou de cont și statistici persistente

- După login, formularul de autentificare este înlocuit de panoul „Contul meu”, cu username, email, data creării contului și statistici Single, Daily și Duel.
- Selectorul Single/Daily/Duel afișează victorii, înfrângeri, remize, streak-ul curent, recordul și distribuția victoriilor pe cele 6 încercări.
- Panoul afișează ultimele 10 jocuri cu modul, rezultatul, dificultatea, numărul de încercări și data locală a browserului.
- Rezultatele sunt înregistrate numai din fluxurile validate de server; browserul nu are endpoint pentru a declara direct o victorie.
- `user_game_results` păstrează chei unice de rezultat pentru a preveni dublarea, inclusiv la reluarea aceleiași provocări Daily.
- `user_game_stats` păstrează contoare agregate pentru încărcarea rapidă a panoului.
- Actualizarea registrului și a contoarelor este tranzacțională în PostgreSQL. Dacă actualizarea statisticilor eșuează temporar, jocul continuă, iar eroarea este logată fără identificatorul utilizatorului.
- `GET /api/account/summary` folosește exclusiv utilizatorul sesiunii curente și răspunde cu `Cache-Control: no-store`.
- Interogarea istoricului este limitată și folosește indexul existent pe utilizator și data finalizării; răspunsul nu expune `userId`, cheia internă a rezultatului sau informații despre pilotul țintă.
- Statisticile Guest din `localStorage` rămân separate și nu sunt importate automat într-un cont.

Local poți rămâne pe SQLite, fără `DATABASE_URL`:

```env
DATABASE_PROVIDER=sqlite
```

### Protecție Socket.IO anti-spam

Serverul limitează event-urile Socket.IO sensibile per socket, ca să reducă spam-ul din consolă sau scripturi automate. Sunt protejate acțiuni precum `joinRoom`, `setDifficulty`, `submitGuess`, `startSingleGame`, `submitSingleGuess`, `startDailyChallenge`, `submitDailyGuess`, `restartGame`, `refreshAuthUser` și `abortDuelRound`.

Dacă limita este depășită, serverul emite `socketRateLimited` și un `errorMessage` generic, fără să execute handlerul original. `leaveRoom`, `disconnecting` și `disconnect` nu sunt limitate, ca jucătorul să poată părăsi camera sau să se deconecteze normal.

### Logging și erori production

Serverul folosește un logger centralizat în `server/logger.js` și request logging în `server/middleware/requestLogging.js`. În production logurile sunt JSON, utile pentru Render Logs.

Config recomandat:

```env
LOG_LEVEL=info
REQUEST_LOGGING_ENABLED=true
```

Protecții incluse:

```text
- nu se loghează body-uri de request;
- query string-ul este eliminat din path-ul logat;
- câmpurile sensibile precum password, token, secret, cookie și authorization sunt redactate;
- fiecare request primește `X-Request-Id`;
- erorile 500 sunt logate cu requestId/metodă/path/status, dar răspunsul public rămâne generic în production;
- `uncaughtException` și `unhandledRejection` sunt logate și serverul încearcă un shutdown controlat.
```

### Metrici operaționale Prometheus/OpenMetrics

Metricile sunt independente de platforma de monitorizare și sunt dezactivate implicit.
Pentru o verificare locală sau pentru conectarea ulterioară a unui scraper:

```env
METRICS_ENABLED=true
METRICS_TOKEN=<token-random-de-minimum-32-caractere>
METRICS_INCLUDE_PROCESS=true
```

Endpoint-ul nu este public și nu folosește sesiunea utilizatorului. Trimite token-ul
dedicat exclusiv în headerul `Authorization`:

```bash
curl -H "Authorization: Bearer <metrics-token>" http://localhost:3000/metrics
```

Sunt agregate numărul și starea camerelor, membrii conectați/deconectați, lifecycle-ul
camerelor, reconectările și expirarea grace period-ului, operațiile și duratele Redis/
PostgreSQL, conexiunile pool-ului PostgreSQL și deciziile de rate limiting HTTP/Socket.IO.
Etichetele au valori fixe și nu includ ID-uri de cameră, socket, utilizator, IP sau alte
date cu cardinalitate mare. Când `METRICS_ENABLED=false`, ruta răspunde cu `404`, iar
colectarea custom nu adaugă lucru suplimentar fluxurilor aplicației.

---

## Build frontend

CSS-ul este păstrat modular în `public/css/`, iar `public/style.css` rămâne fișierul sursă care definește ordinea modulelor. Browserul încarcă varianta generată:

```text
public/style.bundle.css
```

După ce modifici fișierele din `public/css/` sau ordinea importurilor din `public/style.css`, rulează:

```bash
npm run build:css
```

Asta regenerează bundle-ul fără reguli runtime `@import` și îl minifică automat cu `esbuild`, reducând atât numărul de request-uri CSS, cât și dimensiunea transferată la încărcarea paginii. Build-ul raportează dimensiunea surselor combinate și reducerea obținută, iar testele păstrează un buget de maximum 100 KB pentru bundle-ul minificat. `esbuild` rămâne intenționat în `dependencies`, deoarece este necesar în etapa de build inclusiv pe platformele care instalează numai dependențele de production, precum unele configurări Render. Scriptul de release rulează automat întregul build frontend înainte să creeze arhiva ZIP.

JavaScript-ul rămâne modular în `public/game.js` și `public/js/`, iar browserul primește varianta unică, minificată:

```text
public/game.bundle.min.js
```

După orice modificare JavaScript frontend, rulează:

```bash
npm run build:js
```

Pentru regenerarea ambelor bundle-uri frontend folosește comanda recomandată inclusiv pe Render:

```bash
npm run build
```

`themeBootstrap.js` rămâne intenționat separat și rulează înainte de CSS, pentru ca tema salvată să fie aplicată fără flash vizual.

---

## Creare release ZIP curat

Pentru a genera o arhivă de distribuție fără fișiere de development sau runtime, rulează:

> Comanda regenerează automat `public/style.bundle.css` și `public/game.bundle.min.js` înainte de arhivare.

```bash
npm run release:zip
```

Arhiva este creată în folderul `dist/`, de exemplu:

```text
dist/f1guesserduel-v1.0.0.zip
```

Release-ul exclude automat:

- `.git/`;
- `node_modules/`;
- `dist/`;
- `.env`;
- `data/rooms.json`;
- baze SQLite runtime din `data/`;
- loguri, backup-uri, patch-uri și fișiere temporare;
- folderul `test/`, implicit;
- folderul `.github/`, implicit.

Dacă vrei o arhivă care să includă și testele, rulează:

```bash
npm run release:zip:with-tests
```

Pentru verificare fără generarea arhivei, poți rula:

```bash
node scripts/create-release-zip.js --dry-run
```

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
| Easy | Piloți actuali, campioni moderni și nume foarte cunoscute |
| Medium | Piloți moderni secundari și legende istorice cunoscute |
| Hard | Piloți istorici, obscuri sau cu apariții puține |

Dificultatea este o clasificare hibridă bazată pe epocă, relevanță și
notorietate. Este trimisă către server, iar serverul filtrează lista din
`data/drivers.json`. La adăugarea unui pilot trebuie păstrate ID-urile unice,
câmpurile obligatorii și una dintre valorile `easy`, `medium` sau `hard`.

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

## Statistici

Pentru Guest, statisticile sunt salvate local în browser prin `localStorage` și
rămân specifice dispozitivului. Pentru utilizatorii autentificați, rezultatele
validate de server sunt persistate în SQLite sau PostgreSQL și apar în profil.

Sunt urmărite:

- numărul total de jocuri;
- rata de câștig;
- streak-ul curent;
- distribuția încercărilor.

Conturile păstrează separat statisticile Single, Daily și Duel, ultimele 10
jocuri, XP-ul, nivelul și badge-urile. Statisticile Guest nu sunt importate
automat într-un cont.

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

Fișier sursă principal: `public/game.js`

Fișier livrat browserului: `public/game.bundle.min.js`, generat automat și care nu trebuie editat manual.

Responsabilități:

- orchestrează modulele frontend din `public/js/`;
- separă stările Single, Daily și Duel;
- gestionează camera, lobby-ul, autocomplete-ul și trimiterea ghicirilor;
- randează gridul, scoreboard-ul, progresul adversarului și dialogul final;
- coordonează autentificarea, profilul, statisticile și setările contului;
- gestionează temele, timerul și link-ul de share.

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
- Bundle CSS generat din modulele din `public/css/`, încărcat direct de `public/index.html`.
- Minificare CSS automată, cu buget de maximum 100 KB verificat prin teste.
- Acoperire `prefers-reduced-motion` pentru animațiile și tranzițiile interfeței.

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
- Bundle de producție IIFE generat cu esbuild din cele 35 de module frontend.
- Minificare, tree-shaking și eliminarea request-urilor runtime pentru modulele JavaScript individuale.
- Bundle fără source map public și cu `"use strict"` păstrat explicit.
- Interfața de cont este separată în orchestrare auth, dashboard/statistici, setări și maparea elementelor DOM.

### Încărcare, temă și cache frontend

- Tema salvată este citită prin `public/js/themeBootstrap.js` înainte de încărcarea CSS-ului, eliminând schimbarea vizibilă de temă după afișarea meniului.
- Valorile necunoscute din `localStorage` sunt ignorate și folosesc tema `default`.
- Răspunsurile text mai mari de 1 KB folosesc automat Brotli sau gzip, în funcție de capabilitățile browserului.
- Fișierele CSS/JavaScript cu parametrul `?v=` primesc cache public `immutable` pentru un an; fișierele fără versiune trebuie revalidate.
- HTML-ul rămâne fără cache persistent, astfel încât un deploy nou poate furniza imediat URL-urile versionate actualizate.
- `npm run build` calculează automat versiuni SHA-256 scurte din conținutul bootstrap-ului temei și al bundle-urilor CSS/JavaScript, apoi actualizează `public/index.html`.

Valorile `?v=` nu trebuie modificate manual. Hash-urile normalizează terminatoarele de linie, astfel încât același conținut primește aceeași versiune pe Windows și Linux. GitHub Actions verifică dacă bundle-urile și referințele versionate au fost regenerate înainte de commit.

### Backend și persistență

- Evenimentele Socket.IO Duel sunt separate pe lobby, rundă și lifecycle, iar `registerSocketHandlers.js` a rămas orchestratorul conexiunii.
- Salvarea camerelor în `rooms.json` folosește operații asincrone și nu blochează bucla principală a jocului.
- Scrierile sunt serializate și modificările apărute în timpul unei salvări sunt combinate într-o salvare ulterioară cu starea cea mai nouă.
- Fișierul este înlocuit atomic printr-un fișier temporar, iar shutdown-ul controlat așteaptă terminarea salvării.
- Erorile de scriere sunt păstrate pentru health check și sunt eliminate după prima salvare reușită.
- Statisticile conturilor sunt separate pe `single`, `daily` și `duel`, cu victorii, remize, streak și distribuția încercărilor.

### Calitate, accesibilitate și securitate

- GitHub Actions rulează coverage cu praguri, build verificat și teste reale cu Redis/PostgreSQL.
- E2E acoperă Single, Daily, Duel, login, profil, reconectare și perspectiva spectatorului.
- Auditul axe verifică 18 stări în toate cele trei teme.
- Regresia vizuală compară 10 capturi cu baseline-uri versionate și generează imagini diff la eșec.
- Controalele interactive sunt native, dialogurile au focus trap, iar meniurile și popup-urile au atribute ARIA.
- Cererile HTTP sensibile aplică protecție CSRF/origin, iar originile Socket.IO sunt validate strict.
- Rate limiting-ul funcționează local sau distribuit prin Redis pentru HTTP și Socket.IO.
- Helmet configurează CSP fără `unsafe-inline`, blochează atributele inline de script/stil și activează protecție anti-clickjacking, `Referrer-Policy` și HSTS în production.
- Health checks, logging structurat, redactarea datelor sensibile și graceful shutdown sunt active.
- Metricile operaționale agregate sunt disponibile în format Prometheus/OpenMetrics printr-un endpoint opt-in protejat.

### Asset-uri

- Flag-urile locale se încarcă direct ca `.svg`.
- 26 dintre cele 28 de logo-uri raster folosite în producție sunt livrate în format WebP near-lossless; dimensiunea lor totală a scăzut de la aproximativ `1,70 MB` la `784 KB` (`53,9%`).
- `BrawnGP.jpg` și `Spyker.jpg` rămân în formatul original deoarece variantele WebP ar fi fost mai mari.
- Logo-urile păstrează dimensiunile originale și folosesc fallback-ul local `/logos/F1.svg` dacă încărcarea eșuează.

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

Înainte de un commit sau pull request:

```bash
npm test
npm run build
```

Pentru modificări de interfață rulează și:

```bash
npm run test:e2e:responsive
npm run test:e2e:accessibility
```

După fiecare modificare importantă verifică:

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

## Status și roadmap

### Stare curentă

Aplicația este stabilă pentru deployment pe o singură instanță Node.js și are:

- moduri Single, Daily și Duel complet separate;
- conturi, profil, statistici și sesiuni persistente;
- persistență locală sau Redis pentru camere și rate limiting;
- build-uri CSS/JavaScript minificate și versionate;
- coverage cu praguri, servicii reale în CI și scenarii E2E;
- audit automat de accesibilitate și regresie vizuală cu baseline-uri;
- CSP strict fără `unsafe-inline`, cu procente dinamice limitate la clase CSS predefinite;
- health checks, logging structurat și graceful shutdown.

Lista consolidată de optimizări este finalizată pentru deployment-ul actual pe o
singură instanță. A rămas un singur punct tehnic condiționat de arhitectura de deploy.

### Optimizări tehnice rămase

1. **Scalare Socket.IO multi-instance**

   Redis adapter pentru distribuirea evenimentelor, ownership/concurență pentru
   camere și teste cu minimum două instanțe. Această etapă devine necesară doar
   când deployment-ul rulează mai mult de un proces al aplicației.

### Idei de produs, fără prioritate tehnică

- leaderboard persistent;
- redesign vizual suplimentar inspirat de timing screen-urile F1;
- code splitting pentru ecranele încărcate rar, dacă bundle-ul crește semnificativ.

Pentru detaliile de deployment consultă `DEPLOYMENT.md`; pentru scenariile browser
și actualizarea baseline-urilor consultă `test/e2e/README.md`.
