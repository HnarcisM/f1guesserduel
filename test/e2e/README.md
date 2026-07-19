# E2E browser tests

Aceste teste pornesc serverul local pe un port liber și deschid 3 taburi reale cu Playwright:

1. Player 1 / host
2. Player 2
3. Spectator

Testele verifică faptul că spectatorul vede live board-ul, iar playerii nu îl văd. Mai există teste pentru restaurarea unei camere după restart server, auth register/login/logout cu refresh pe socket, rematch după final de rundă, Single Play fără cameră, Daily Challenge izolat de Single/Duel și cazul în care playerul non-host ghicește corect iar spectatorul vede rezultatul live.

Suita separată `responsiveVisual.e2e.test.js` verifică automat layout-ul paginii de start și al jocului pe telefon, ecranul exterior Galaxy Fold 5, ecranul interior Fold în portrait/landscape și desktop. Pentru fiecare stare verifică overflow-ul orizontal, limitele elementelor importante și suprapunerile, apoi salvează capturi PNG și un raport JSON în `test-results/responsive-visual/`.

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

Capturile generate local nu intră în Git. În GitHub Actions sunt încărcate ca artefact `responsive-visual-<run_attempt>` și sunt păstrate 14 zile, inclusiv când testul eșuează.

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
