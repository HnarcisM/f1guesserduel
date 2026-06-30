# E2E browser tests

Aceste teste pornesc serverul local pe un port liber și deschid 3 taburi reale cu Playwright:

1. Player 1 / host
2. Player 2
3. Spectator

Testul verifică faptul că spectatorul vede live board-ul, iar playerii nu îl văd.

## Setup inițial

```bash
npm install
npm run e2e:install
```

## Rulare

```bash
npm run test:e2e
```

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
