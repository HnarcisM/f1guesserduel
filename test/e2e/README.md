# E2E browser tests

Aceste teste pornesc serverul local pe un port liber și deschid 3 taburi reale cu Playwright:

1. Player 1 / host
2. Player 2
3. Spectator

Testele verifică faptul că spectatorul vede live board-ul, iar playerii nu îl văd. Mai există teste pentru restaurarea unei camere după restart server, auth register/login/logout cu refresh pe socket, rematch după final de rundă, Single Play fără cameră, Daily Challenge izolat de Single/Duel și cazul în care playerul non-host ghicește corect iar spectatorul vede rezultatul live.

Suita separată `responsiveVisual.e2e.test.js` verifică automat layout-ul paginii de start și al jocului pe telefon, ecranul exterior Galaxy Fold 5, ecranul interior Fold în portrait/landscape și desktop. Pentru fiecare stare verifică overflow-ul orizontal, limitele elementelor importante și suprapunerile, apoi compară captura pixel cu pixel cu baseline-ul versionat din `test/e2e/baselines/responsive-visual/`. Capturile curente, raportul JSON și eventualele imagini `*.diff.png` sunt salvate în `test-results/responsive-visual/`.

Suita `accessibility.e2e.test.js` rulează axe-core în Chromium pentru 18 ecrane și stări: pagina principală, meniul de navigare, selecția și jocul Daily, browserul, lobby-ul, jocul și rezultatul Duel, perspectiva spectatorului, o rundă Single, login, înregistrare și toate taburile profilului autentificat, inclusiv setările extinse. Fiecare stare este verificată în temele Default, Neon și Carbon. Testul eșuează la orice încălcare axe și salvează raportul complet în `test-results/accessibility/axe-report.json`.

## Rulare rapidă pe Windows

Rulează fișierul:

```bat
F1GuesserDuel_Tests.bat
```

Acesta instalează/verifică dependențele complete, instalează Chromium pentru Playwright și rulează testele backend + E2E. În timpul E2E vei vedea mesaje `[E2E ora] ...` pentru pașii importanți: pornire server, deschidere taburi, confirmare spectator și verificare live board.

## Rulare rapidă pe CachyOS / Arch

```bash
./F1GuesserDuel_Tests_cachyos.sh
```

## Rulare manuală

Setup inițial:

```bash
npm install
npm run test:e2e:install
```

`npm run e2e:install` rămâne disponibil ca alias pentru compatibilitate.

Teste E2E:

```bash
npm run test:e2e
```

Numai testele responsive și vizuale:

```bash
npm run test:e2e:responsive
```

Baseline-urile se actualizează numai după verificarea intenționată a schimbării vizuale:

```bash
UPDATE_VISUAL_BASELINES=1 npm run test:e2e:responsive
```

În PowerShell:

```powershell
$env:UPDATE_VISUAL_BASELINES="1"; npm run test:e2e:responsive
```

Numai auditul automat de accesibilitate:

```bash
npm run test:e2e:accessibility
```

Numai fluxurile pentru profil și reconectare:

```bash
npm run test:e2e:flows
```

Scenariul de profil creează un cont în baza SQLite izolată a serverului de test,
actualizează avatarul și username-ul, apoi verifică persistența lor după reload.
Scenariul de reconectare pornește un Duel cu doi jucători și confirmă că refresh-ul
păstrează identificatorul tabului, rolul de host, numărul participanților și
încercările deja trimise.

Rapoartele și capturile generate local nu intră în Git. În GitHub Actions sunt încărcate ca artefact `browser-quality-<run_attempt>` și sunt păstrate 14 zile, inclusiv când un test eșuează.

`npm run test:e2e` rulează automat `pretest:e2e`, care verifică Chromium înainte de pornirea browserului. Dacă Chromium lipsește, scriptul încearcă instalarea și oprește testele cu mesaj explicit dacă instalarea nu reușește.

Testele E2E au timeout de siguranță de 60 de secunde, ca să nu rămână blocate fără rezultat.

În mediul E2E, serverul folosește o țintă de duel deterministă (`E2E_FIXED_DUEL_TARGET_ID=LIN`) ca scenariile cu răspuns corect să nu depindă de random.

Pentru toate testele:

```bash
npm run test:all
```

Pentru rulare cu browser vizibil:

```bash
E2E_HEADED=1 npm run test:e2e
```

Pe Windows PowerShell:

```powershell
$env:E2E_HEADED="1"; npm run test:e2e
```


## Daily Challenge reset

Daily Challenge se resetează la miezul nopții local al browserului și este blocat separat per cont, dificultate și zi.

## Test launcher progress

`F1GuesserDuel_Tests.bat` și `F1GuesserDuel_Tests_cachyos.sh` afișează mesaje `[progress]` pentru comenzile lungi, inclusiv `npm install`, instalarea Chromium Playwright și testele E2E.
