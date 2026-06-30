# E2E browser tests

Aceste teste pornesc serverul local pe un port liber și deschid 3 taburi reale cu Playwright:

1. Player 1 / host
2. Player 2
3. Spectator

Testul verifică faptul că spectatorul vede live board-ul, iar playerii nu îl văd.

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
npm run e2e:install
```

Teste E2E:

```bash
npm run test:e2e
```

Testele E2E au timeout de siguranță de 60 de secunde, ca să nu rămână blocate fără rezultat.

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
