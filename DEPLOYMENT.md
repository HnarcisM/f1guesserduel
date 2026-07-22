# Deploy F1 Guesser Duel pe Render

Acest ghid descrie configurarea recomandată pentru publicarea aplicației pe Render ca **Web Service Node.js** conectat la GitHub.

> Notă importantă: Render Free este potrivit pentru demo/test. Serviciul poate intra în sleep după inactivitate, iar filesystem-ul local este efemer. Pentru conturi persistente folosim Postgres extern prin `DATABASE_PROVIDER=postgres` și `DATABASE_URL`. Opțional, `REDIS_URL` păstrează snapshot-ul camerelor și contoarele de rate limit în afara filesystem-ului efemer.

---

## 1. Pregătire repo

Înainte de deploy, rulează local:

```bash
npm ci
npm run build
npm test
```

Apoi urcă modificările în branch-ul conectat la Render, de exemplu `master`:

```bash
git add .
git commit -m "Prepare Render production config"
git push origin master
```

---

## 2. Deploy din Render Dashboard

În Render:

1. Alege **New > Web Service**.
2. Conectează GitHub.
3. Selectează repository-ul `HnarcisM/f1guesserduel`.
4. Setează branch-ul folosit pentru deploy, de exemplu `master`.
5. Folosește setările:

```text
Runtime: Node
Build Command: npm ci --include=dev && npm run build
Start Command: npm start
Health Check Path: /api/health
Auto-Deploy: On Commit
```

Nu seta manual `PORT`. Aplicația citește `process.env.PORT`, iar Render îl injectează automat.

---

## 3. Variabile de mediu recomandate

Adaugă în **Environment**:

```env
NODE_ENV=production
TRUST_PROXY=true
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
SESSION_COOKIE_NAME=f1_session
SESSION_MAX_AGE_DAYS=7
SOCKET_AUTH_TOKEN_MAX_AGE_MS=120000
SESSION_CLEANUP_INTERVAL_MS=900000
ROOM_SAVE_DEBOUNCE_MS=250
PERSISTENCE_MODE=ephemeral
DATA_DIR=/tmp/f1guesserduel
ROOMS_FILE_PATH=/tmp/f1guesserduel/rooms.json
DATABASE_PROVIDER=postgres
DATABASE_URL=<connection-string-neon>
POSTGRES_SSL=true
PUBLIC_ORIGIN=https://numele-serviciului-tau.onrender.com
LOG_LEVEL=info
REQUEST_LOGGING_ENABLED=true
```

Adaugă separat două secrete lungi:

```env
SESSION_SECRET=<secret-random-lung>
SOCKET_AUTH_SECRET=<alt-secret-random-lung>
```

Le poți genera local cu:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Rulează comanda de două ori: o dată pentru `SESSION_SECRET`, o dată pentru `SOCKET_AUTH_SECRET`.


### Conturi persistente cu Neon Postgres

Pentru varianta free recomandată:

1. Creează un proiect Postgres în Neon.
2. Copiază connection string-ul de tip `postgresql://...`.
3. În Render → Environment setează:

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
POSTGRES_SSL=true
PERSISTENCE_MODE=ephemeral
```

Important: `DATABASE_URL` trebuie setat în Render înainte de redeploy dacă `DATABASE_PROVIDER=postgres`. Dacă lipsește, serverul se oprește intenționat cu mesaj clar, ca să nu pornească accidental pe SQLite efemer.

Ca protecție suplimentară, serverul refuză orice configurație production care combină SQLite cu `PERSISTENCE_MODE=ephemeral` sau cu un fișier al bazei aflat în `/tmp` ori `/var/tmp`. Folosește Postgres extern sau un disk persistent real.

La pornire, aplicația creează automat tabelele Postgres necesare:

```text
users
sessions
user_game_results
user_game_stats
```

Conturile, sesiunile și statisticile utilizatorilor autentificați se păstrează în Postgres. Migrarea `002_account_game_stats.sql` este aplicată automat la primul deploy al acestei versiuni și nu necesită variabile noi. Fără Redis, camerele active rămân în `rooms.json` pe `/tmp`, deci pot dispărea la restart/redeploy/sleep.

### Redis opțional pentru camere și rate limiting

După ce creezi separat un serviciu Redis, copiază URL-ul lui în Render → Environment. Pentru un provider cloud folosește de preferat conexiunea TLS `rediss://`:

```env
REDIS_URL=rediss://default:password@host:port
REDIS_KEY_PREFIX=f1guesserduel
REDIS_CONNECT_TIMEOUT_MS=10000
REDIS_ROOM_TTL_SECONDS=86400
```

Nu este nevoie să modifici `ROOMS_FILE_PATH`: când `REDIS_URL` este prezent, serverul selectează automat Redis pentru snapshot-ul camerelor și pentru rate limiting-ul Socket.IO plus endpoint-urile de login/register. Dacă variabila lipsește, fallback-ul rămâne `rooms.json` plus contoare locale în memorie.

La pornire, o conexiune Redis configurată dar indisponibilă oprește deploy-ul cu o eroare clară. După pornire, o întrerupere Redis apare în `/api/health`; rate limiting-ul revine la contoare locale în memorie, iar mesajele Redis repetitive din log sunt limitate.

Această etapă nu include adapterul Socket.IO Redis. Snapshot-ul restaurează camerele după restart pentru o singură instanță, iar rate limiting-ul este distribuit, dar duelurile live nu sunt încă sincronizate complet între mai multe instanțe de server.

### Socket.IO rate limit

Pentru deploy public, păstrează activă protecția anti-spam pe event-urile Socket.IO:

```env
SOCKET_RATE_LIMIT_ENABLED=true
SOCKET_RATE_LIMIT_WINDOW_MS=60000
```

Fără Redis, limitele sunt aplicate per socket. Cu `REDIS_URL`, contoarele sunt atomice și distribuite per utilizator autentificat sau adresă anonimă. Limitele sunt diferite pe categorii: acțiunile de lobby/start/restart au limite mai stricte, iar guess-urile au o limită mai mare ca să nu afecteze jocul normal. Dacă un client face spam, serverul emite `socketRateLimited` și nu mai execută handlerul pentru event-ul blocat.

### Rate limit autentificare

Endpoint-urile `/api/auth/login` și `/api/auth/register` păstrează limite separate: maximum 5 încercări de login, respectiv 3 încercări de înregistrare, într-o fereastră de 10 minute per adresă IP.

Cu `REDIS_URL`, aceste contoare sunt distribuite și persistă între procese sau restarturi Redis-compatible. Adresa IP nu este inclusă în cheia Redis în clar, ci este transformată într-un hash. Fără Redis sau în timpul unei întreruperi temporare, aplicația folosește automat contoare locale în memorie. Răspunsurile blocate folosesc HTTP `429` și includ `Retry-After` plus headerele `X-RateLimit-*`.

### Logging production

Pentru Render, păstrează:

```env
LOG_LEVEL=info
REQUEST_LOGGING_ENABLED=true
```

Asta produce loguri JSON pentru request-uri și erori, fără să includă body-uri, query string-uri, parole, token-uri, cookie-uri sau secrete. Fiecare request primește și headerul `X-Request-Id`, util când cauți aceeași eroare în Render Logs.

### Origini permise pentru Socket.IO și protecția CSRF

Pentru deploy online setează `PUBLIC_ORIGIN` la adresa publică exactă a aplicației, fără slash sau path la final:

```env
PUBLIC_ORIGIN=https://numele-serviciului-tau.onrender.com
LOG_LEVEL=info
REQUEST_LOGGING_ENABLED=true
```

Această valoare este folosită de Socket.IO și de rutele HTTP sensibile de cont. Cererile care modifică profilul, parola, avatarul sau sesiunile sunt respinse dacă `Origin`/`Referer` nu corespunde exact unei origini autorizate. Dacă ai și un preview/staging, poți adăuga origini extra:

```env
SOCKET_ALLOWED_ORIGINS=https://preview.example.com,https://staging.example.com
```

În development, aplicația permite automat `localhost`, `127.0.0.1` și `[::1]` pe portul local configurat. În production nu sunt adăugate origini locale automat.

---

## 4. Blueprint opțional: `render.yaml`

Repo-ul include `render.yaml`, astfel încât poți folosi și Render Blueprint.

Fișierul setează automat:

- build command;
- start command;
- health check path;
- variabile non-secrete de production;
- `PERSISTENCE_MODE=ephemeral` pentru Render Free;
- `DATABASE_PROVIDER=postgres` pentru conturi persistente prin Postgres extern;
- `DATABASE_URL` ca variabilă nesincronizată, completată manual în Render;
- `PUBLIC_ORIGIN` ca variabilă nesincronizată, pe care o completezi cu URL-ul Render real;
- `SESSION_SECRET` și `SOCKET_AUTH_SECRET` ca variabile nesincronizate, care trebuie completate în Render.

Nu pune niciodată valorile reale ale secretelor în Git.

---

## 5. Persistență date

### Variantă A: Render Free + Neon Postgres pentru conturi

Folosește:

```env
PERSISTENCE_MODE=ephemeral
DATA_DIR=/tmp/f1guesserduel
ROOMS_FILE_PATH=/tmp/f1guesserduel/rooms.json
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
POSTGRES_SSL=true
```

Această variantă păstrează aplicația pe Render Free, dar mută conturile și sesiunile în Postgres extern. Astfel, conturile nu mai dispar la redeploy.

Camerele active rămân efemere în `rooms.json`. Este acceptabil pentru Duel, pentru că o cameră activă poate fi recreată după restart/redeploy/sleep.

### Configurație locală efemeră interzisă în production

Dacă nu setezi Postgres și rămâi pe:

```env
DATABASE_PROVIDER=sqlite
PERSISTENCE_MODE=ephemeral
DATA_DIR=/tmp/f1guesserduel
```

serverul refuză să pornească și explică faptul că SQLite nu poate păstra în siguranță conturile și sesiunile pe stocare efemeră. Această protecție previne un deploy aparent funcțional care ar pierde ulterior utilizatorii.

Endpoint-ul `/api/health` include informații non-sensibile utile pentru Render și debugging:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "nodeEnv": "production",
  "uptimeSeconds": 123,
  "timestamp": "2026-07-07T00:00:00.000Z",
  "persistence": {
    "mode": "ephemeral"
  },
  "database": {
    "provider": "postgres"
  },
  "checks": {
    "database": { "status": "ok" },
    "redis": { "status": "ok" },
    "drivers": { "status": "ok", "count": 166 },
    "rooms": { "status": "ok", "activeRooms": 0, "persistence": "ok", "provider": "redis" }
  }
}
```

Cheia `redis` apare numai când `REDIS_URL` este configurat; altfel `rooms.provider` este `file`.

Dacă un check critic eșuează, răspunsul devine `status=degraded` și HTTP `503`. Endpoint-ul nu expune path-uri locale, secrete, cookie-uri, token-uri sau conținutul camerelor.

### Variantă cu persistent disk

Dacă activezi persistent disk plătit în Render, folosește:

```env
PERSISTENCE_MODE=persistent
DATA_DIR=/var/data
DB_FILE_PATH=/var/data/f1guesser.sqlite
ROOMS_FILE_PATH=/var/data/rooms.json
```

---

## 6. Security headers

Aplicația activează automat security headers prin `helmet` în `server/middleware/securityHeaders.js`. Nu trebuie setată nicio variabilă specială pe Render pentru acest pas.

Configurația include:

```text
- Content-Security-Policy cu `script-src 'self'` și `style-src 'self'`;
- atributele inline de script și stil sunt blocate explicit prin `script-src-attr 'none'` și `style-src-attr 'none'`;
- `connect-src 'self' ws: wss:` pentru Socket.IO;
- allowlist de origin pentru Socket.IO prin `PUBLIC_ORIGIN` / `SOCKET_ALLOWED_ORIGINS`;
- rate limit Socket.IO pentru event-uri sensibile, prin `SOCKET_RATE_LIMIT_ENABLED` / `SOCKET_RATE_LIMIT_WINDOW_MS`;
- logging production cu `LOG_LEVEL` / `REQUEST_LOGGING_ENABLED` și redactare automată pentru date sensibile;
- `img-src 'self' data:` pentru assets locale;
- `frame-ancestors 'none'`;
- `object-src 'none'`;
- `Referrer-Policy: no-referrer`;
- HSTS doar când `NODE_ENV=production`.
```

Timerul și barele de progres folosesc o listă finită de clase procentuale din
`public/css/13-progress-values.css`; frontend-ul nu necesită `unsafe-inline`.

---

## 7. Verificări după deploy

După deploy, testează:

```text
/
/api/health
```

Checklist manual:

1. Deschide aplicația în două browsere diferite.
2. Creează o cameră Duel.
3. Intră cu al doilea jucător.
4. Schimbă setările din lobby ca host.
5. Pornește duelul.
6. Trimite guess-uri din ambele browsere.
7. Testează disconnect/reconnect.
8. Testează register/login/logout.

---

## 8. Probleme frecvente

### Prima accesare este lentă

Pe planul Free, serverul poate porni din sleep. După primul request, aplicația ar trebui să răspundă normal.

### Login-ul nu păstrează sesiunea

Verifică:

```env
NODE_ENV=production
TRUST_PROXY=true
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
PUBLIC_ORIGIN=https://numele-serviciului-tau.onrender.com
LOG_LEVEL=info
REQUEST_LOGGING_ENABLED=true
SESSION_SECRET=<setat>
```

### Aplicația pornește local, dar nu pe Render

Verifică în logs:

- dacă lipsește `SESSION_SECRET`;
- dacă `SOCKET_AUTH_SECRET` este gol;
- dacă `PORT` a fost setat manual greșit;
- dacă build command-ul rulează `npm ci --include=dev && npm run build`.
