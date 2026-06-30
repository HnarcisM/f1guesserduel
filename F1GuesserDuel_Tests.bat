@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title F1 Guesser Duel - Teste

echo ============================================================
echo  F1 Guesser Duel - verificare dependinte si rulare teste
echo ============================================================
echo.
echo Acest fisier ruleaza testele backend si E2E cu browser real.
echo Testele E2E pot dura 1-3 minute la prima rulare deoarece verifica Chromium.
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo EROARE: Node.js nu este disponibil in PATH.
    echo Ruleaza mai intai F1GuesserDuel.bat ca sa instaleze/configureze Node.js.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo EROARE: npm nu este disponibil in PATH.
    echo Ruleaza mai intai F1GuesserDuel.bat ca sa configureze Node.js corect.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
echo Node.js detectat: %NODE_VERSION%
echo.

echo [1/5] Instalez/verific dependentele complete pentru teste...
echo       Daca apare un warning de tip deprecated, nu este neaparat eroare.
call npm.cmd install
if errorlevel 1 (
    echo.
    echo EROARE: npm install a esuat.
    echo Incerc o reinstalare curata o singura data...
    call :removeNodeModules
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo EROARE: Nu am putut instala dependentele pentru teste.
        echo Recomandare: inchide VS Code/terminale care folosesc proiectul si ruleaza din nou acest .bat.
        pause
        exit /b 1
    )
)

echo.
echo [2/5] Verific dependentele necesare pentru teste...
node -e "require.resolve('express'); require.resolve('socket.io'); require.resolve('better-sqlite3'); require.resolve('cookie-parser'); require.resolve('playwright'); console.log('Dependinte teste OK.')"
if errorlevel 1 (
    echo.
    echo EROARE: Unele dependinte lipsesc dupa npm install.
    pause
    exit /b 1
)

echo.
echo [3/5] Verific/instalez Chromium pentru Playwright...
echo       Daca Chromium lipseste, descarcarea poate dura cateva minute.
echo       Daca este deja instalat, acest pas se termina repede.
call npm.cmd run e2e:install
if errorlevel 1 (
    echo.
    echo EROARE: Nu am putut instala Chromium pentru Playwright.
    echo Verifica internetul/firewall-ul/proxy-ul si ruleaza din nou acest fisier.
    pause
    exit /b 1
)

echo.
echo [4/5] Rulez testele backend...
call npm.cmd test
if errorlevel 1 (
    echo.
    echo EROARE: Testele backend au esuat.
    pause
    exit /b 1
)

echo.
echo [5/5] Rulez testele E2E cu browser real...
echo       Se deschid intern 3 taburi: Player 1, Player 2 si Spectator.
echo       Vei vedea mesaje [E2E ora] pentru fiecare pas important.
call npm.cmd run test:e2e
if errorlevel 1 (
    echo.
    echo EROARE: Testele E2E au esuat.
    echo Cauta in mesajele de mai sus ultima linie [E2E ...] ca sa vezi la ce pas s-a oprit.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Toate testele au trecut cu succes.
echo ============================================================
pause
exit /b 0

:removeNodeModules
if exist "node_modules" (
    echo Sterg node_modules...
    rmdir /s /q "node_modules" 2>nul
    if exist "node_modules" (
        echo Nu am putut sterge complet node_modules. Incerc cu PowerShell...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath 'node_modules' -Recurse -Force -ErrorAction SilentlyContinue"
    )
)
if exist "package-lock.json" (
    echo Sterg package-lock.json pentru reinstalare curata...
    del /f /q "package-lock.json" 2>nul
)
exit /b 0
