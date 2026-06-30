@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title F1 Guesser Duel - Teste

echo ============================================================
echo  F1 Guesser Duel - verificare dependinte si rulare teste
echo ============================================================
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

echo [1/4] Instalez/verific dependentele complete pentru teste...
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
echo [2/4] Verific dependentele necesare pentru teste...
node -e "require.resolve('express'); require.resolve('socket.io'); require.resolve('better-sqlite3'); require.resolve('cookie-parser'); require.resolve('playwright'); console.log('Dependinte teste OK.')"
if errorlevel 1 (
    echo.
    echo EROARE: Unele dependinte lipsesc dupa npm install.
    pause
    exit /b 1
)

echo.
echo [3/4] Verific/instalez Chromium pentru Playwright...
call npm.cmd run e2e:install
if errorlevel 1 (
    echo.
    echo EROARE: Nu am putut instala Chromium pentru Playwright.
    echo Verifica internetul/firewall-ul/proxy-ul si ruleaza din nou acest fisier.
    pause
    exit /b 1
)

echo.
echo [4/4] Rulez testele backend + E2E browser...
call npm.cmd run test:all
if errorlevel 1 (
    echo.
    echo EROARE: Unele teste au esuat.
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
)
if exist "package-lock.json" (
    echo Sterg package-lock.json pentru reinstalare curata...
    del /f /q "package-lock.json" 2>nul
)
exit /b 0
