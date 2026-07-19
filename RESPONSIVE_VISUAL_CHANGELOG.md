# Changelog — teste responsive și vizuale

## Adăugat

- Suită E2E dedicată pentru pagina de start și starea de joc.
- Viewport-uri: telefon 360 px, Galaxy Fold 5 cover, Fold interior portrait, Fold interior landscape și desktop.
- Verificări automate pentru overflow orizontal, elemente ieșite din viewport și suprapuneri importante.
- Capturi PNG full-page pentru fiecare viewport și fiecare stare testată.
- Raport JSON cu geometria elementelor în `test-results/responsive-visual/layout-report.json`.
- Job GitHub Actions separat care instalează Chromium și rulează suita browser.
- Artefact GitHub Actions cu capturile și raportul, păstrat 14 zile chiar dacă testul eșuează.
- Comandă locală: `npm run test:e2e:responsive`.
- Teste unitare pentru matricea responsive și configurația CI.

## Refactorizat

- Helper-ele comune de pornire server și deschidere pagini au fost mutate în `test/e2e/e2eTestHarness.js`.
- Testul vechi limitat la header a fost înlocuit de suita completă responsive/vizuală.
- Oprirea serverului E2E este idempotentă și nu rămâne blocată dacă procesul s-a închis deja.

## Fișiere noi

- `.github/workflows/ci.yml` (workflow-ul exista în setul anterior de modificări; acum include și jobul responsive/vizual)
- `test/e2e/e2eTestHarness.js`
- `test/e2e/responsiveVisualConfig.js`
- `test/e2e/responsiveVisual.e2e.test.js`
- `test/responsiveVisualConfig.test.js`
- `test/githubActionsWorkflow.test.js` (creat în optimizarea CI anterioară și extins acum)

## Fișiere modificate

- `.gitignore`
- `README.md`
- `package.json`
- `test/e2e/README.md`
- `test/e2e/duelSpectator.e2e.test.js`

## Verificări efectuate

- `npm run build` — reușit.
- `npm test` — 266/266 teste trecute.
- `npm audit --omit=dev` — 0 vulnerabilități.
- `node --check` pentru fișierele E2E — reușit.
- `git diff --check` — fără erori de whitespace.

Rularea E2E cu browser nu a putut fi finalizată în mediul de lucru: download-ul Chromium a returnat o arhivă goală, iar runtime-ul local Node 24 nu a putut reconstrui binding-ul SQLite destinat Node 22. Workflow-ul folosește Node 22, execută `npm ci`, instalează Chromium cu dependențele de sistem și rulează automat această verificare.
