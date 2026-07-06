# Deploy F1 Guesser Duel pe Render

Acest ghid descrie configurarea recomandată pentru publicarea aplicației pe Render ca **Web Service Node.js** conectat la GitHub.

> Notă importantă: Render Free este potrivit pentru demo/test. Serviciul poate intra în sleep după inactivitate, iar filesystem-ul este efemer. Datele locale SQLite și `rooms.json` pot fi pierdute la restart/redeploy/sleep. Pentru utilizatori permanenți ai nevoie de persistent disk sau de o bază de date externă.

---

## 1. Pregătire repo

Înainte de deploy, rulează local:

```bash
npm ci
npm run build:css
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
Build Command: npm ci && npm run build:css
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
DATA_DIR=/tmp/f1guesserduel
ROOMS_FILE_PATH=/tmp/f1guesserduel/rooms.json
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

---

## 4. Blueprint opțional: `render.yaml`

Repo-ul include `render.yaml`, astfel încât poți folosi și Render Blueprint.

Fișierul setează automat:

- build command;
- start command;
- health check path;
- variabile non-secrete de production;
- `SESSION_SECRET` și `SOCKET_AUTH_SECRET` ca variabile nesincronizate, care trebuie completate în Render.

Nu pune niciodată valorile reale ale secretelor în Git.

---

## 5. Persistență date

### Variantă demo/free

Folosește:

```env
DATA_DIR=/tmp/f1guesserduel
ROOMS_FILE_PATH=/tmp/f1guesserduel/rooms.json
```

Avantaj: simplu și gratuit.

Dezavantaj: datele sunt efemere.

### Variantă cu persistent disk

Dacă activezi persistent disk plătit în Render, folosește:

```env
DATA_DIR=/var/data
DB_FILE_PATH=/var/data/f1guesser.sqlite
ROOMS_FILE_PATH=/var/data/rooms.json
```

---

## 6. Verificări după deploy

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

## 7. Probleme frecvente

### Prima accesare este lentă

Pe planul Free, serverul poate porni din sleep. După primul request, aplicația ar trebui să răspundă normal.

### Login-ul nu păstrează sesiunea

Verifică:

```env
NODE_ENV=production
TRUST_PROXY=true
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
SESSION_SECRET=<setat>
```

### Aplicația pornește local, dar nu pe Render

Verifică în logs:

- dacă lipsește `SESSION_SECRET`;
- dacă `SOCKET_AUTH_SECRET` este gol;
- dacă `PORT` a fost setat manual greșit;
- dacă build command-ul rulează `npm ci && npm run build:css`.
