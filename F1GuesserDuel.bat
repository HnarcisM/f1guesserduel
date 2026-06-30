@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title F1 Guesser Duel - Server

rem Ruleaza totul in aceeasi fereastra CMD.
rem Nu folosim comanda START si pornim serverul direct cu node server.js.

echo ============================================================
echo  F1 Guesser Duel - verificare dependinte si pornire server
echo ============================================================
echo.

set "REQUIRED_NODE_MAJOR=22"
set "NEEDS_NEW_TERMINAL=0"

call :ensureWinget
if errorlevel 1 goto :manualSetupRequired

call :ensureCompatibleNode
if errorlevel 1 goto :manualSetupRequired

call :ensurePython
if errorlevel 1 goto :manualSetupRequired

call :ensureBuildTools
if errorlevel 1 goto :manualSetupRequired

call :configureNpmPython

echo.
echo [5/6] Curat instalari npm incomplete daca este nevoie...
if exist "node_modules\better-sqlite3" (
    node -e "require.resolve('better-sqlite3')" >nul 2>nul
    if errorlevel 1 (
        echo better-sqlite3 pare instalat incomplet. Sterg node_modules pentru reinstalare curata...
        call :removeNodeModules
    )
)

if exist "node_modules" (
    node -e "require.resolve('express'); require.resolve('socket.io'); require.resolve('better-sqlite3'); require.resolve('cookie-parser')" >nul 2>nul
    if errorlevel 1 (
        echo Unele dependinte lipsesc. Sterg node_modules pentru reinstalare curata...
        call :removeNodeModules
    )
)

echo.
echo [5/6] Instalez/verific dependentele proiectului npm pentru server...
call npm.cmd install --omit=dev
if errorlevel 1 (
    echo.
    echo EROARE: npm install a esuat.
    echo Cel mai des motiv: Node incompatibil sau node_modules blocat de Windows/antivirus.
    echo Verifica versiunea afisata mai jos:
    node -v
    echo.
    echo Incerc o reinstalare curata o singura data...
    call :removeNodeModules
    call npm.cmd install --omit=dev
    if errorlevel 1 (
        echo.
        echo EROARE: Nu am putut instala dependentele npm.
        echo Nu pornesc serverul deoarece ar lipsi module precum express.
        echo.
        echo Recomandare:
        echo 1. Inchide VS Code/terminale care folosesc proiectul.
        echo 2. Ruleaza acest .bat cu Run as administrator.
        echo 3. Daca ai Node v26 inca activ, dezinstaleaza Node.js Current si ruleaza din nou.
        pause
        exit /b 1
    )
)

node -e "require.resolve('express'); require.resolve('socket.io'); require.resolve('better-sqlite3'); require.resolve('cookie-parser'); console.log('Dependinte npm OK.')"
if errorlevel 1 (
    echo.
    echo EROARE: npm install s-a terminat, dar dependintele nu pot fi gasite.
    echo Nu pornesc serverul pentru a evita eroarea Cannot find module.
    pause
    exit /b 1
)
echo.
echo [6/6] Pornesc serverul...
echo Aplicatia va fi disponibila de obicei la: http://localhost:3000
echo.
node server.js
pause
exit /b 0

:ensureWinget
echo [1/6] Verific winget...
where winget >nul 2>nul
if errorlevel 1 (
    echo winget nu este disponibil pe acest Windows.
    echo Instaleaza App Installer din Microsoft Store, apoi ruleaza din nou acest fisier.
    exit /b 1
)
echo winget este disponibil.
exit /b 0

:ensureCompatibleNode
echo.
echo [2/6] Verific Node.js compatibil cu better-sqlite3...
call :refreshNvmPath
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nu este instalat. Instalez NVM for Windows si Node %REQUIRED_NODE_MAJOR%...
    call :ensureNvm
    if errorlevel 1 exit /b 1
    call :installAndUseRequiredNode
    exit /b %errorlevel%
)

for /f "tokens=1 delims=." %%M in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%M"
for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
echo Node.js detectat: %NODE_VERSION%

if "%NODE_MAJOR%"=="%REQUIRED_NODE_MAJOR%" (
    echo Node.js este compatibil pentru acest proiect.
    exit /b 0
)

echo.
echo ATENTIE: Ai Node.js %NODE_VERSION%, dar proiectul foloseste better-sqlite3@11.10.0.
echo Pentru Windows folosim Node.js %REQUIRED_NODE_MAJOR%.x ca versiune sigura/compatibila.
echo Instalez/activez Node.js %REQUIRED_NODE_MAJOR% prin NVM for Windows...

call :ensureNvm
if errorlevel 1 exit /b 1
call :installAndUseRequiredNode
if errorlevel 1 exit /b 1

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
echo Node.js activ acum: %NODE_VERSION%
exit /b 0

:ensureNvm
call :refreshNvmPath
where nvm >nul 2>nul
if not errorlevel 1 (
    echo NVM for Windows detectat.
    exit /b 0
)

echo NVM for Windows nu este instalat. Il instalez cu winget...
winget install -e --id CoreyButler.NVMforWindows --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo Instalarea NVM for Windows a esuat.
    exit /b 1
)
set "NEEDS_NEW_TERMINAL=1"
call :refreshNvmPath
where nvm >nul 2>nul
if errorlevel 1 (
    echo NVM a fost instalat, dar nu este in PATH in acest terminal.
    echo Inchide terminalul si ruleaza din nou acest .bat.
    exit /b 1
)
exit /b 0

:installAndUseRequiredNode
call :refreshNvmPath
echo Instalez Node.js %REQUIRED_NODE_MAJOR% daca lipseste...
call nvm install %REQUIRED_NODE_MAJOR%
if errorlevel 1 exit /b 1
echo Activez Node.js %REQUIRED_NODE_MAJOR%...
call nvm use %REQUIRED_NODE_MAJOR%
if errorlevel 1 (
    echo nvm use a esuat. Ruleaza acest .bat cu Run as administrator sau deschide terminalul ca admin.
    exit /b 1
)
call :refreshNvmPath
where npm >nul 2>nul
if errorlevel 1 (
    echo npm nu este disponibil dupa activarea Node %REQUIRED_NODE_MAJOR%.
    echo Inchide si redeschide terminalul, apoi ruleaza din nou .bat-ul.
    exit /b 1
)
exit /b 0

:refreshNvmPath
if defined NVM_HOME set "PATH=%NVM_HOME%;%PATH%"
if defined NVM_SYMLINK set "PATH=%NVM_SYMLINK%;%PATH%"
if exist "%AppData%\nvm\nvm.exe" set "PATH=%AppData%\nvm;%PATH%"
if exist "C:\Program Files\nvm\nvm.exe" set "PATH=C:\Program Files\nvm;%PATH%"
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
exit /b 0

:ensurePython
echo.
echo [3/6] Verific Python pentru node-gyp...
py -3 --version >nul 2>nul
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('py -3 --version 2^>^&1') do echo Python detectat: %%v
    exit /b 0
)
python --version >nul 2>nul
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo Python detectat: %%v
    exit /b 0
)

echo Python nu este instalat. Instalez Python 3.12...
winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
if errorlevel 1 exit /b 1
set "NEEDS_NEW_TERMINAL=1"
exit /b 0

:ensureBuildTools
echo.
echo [4/6] Verific Visual Studio Build Tools / C++ compiler...
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" (
    "%VSWHERE%" -products * -requires Microsoft.VisualStudio.Workload.VCTools -property installationPath >nul 2>nul
    if not errorlevel 1 (
        echo Visual Studio C++ Build Tools detectat.
        exit /b 0
    )
)

where cl >nul 2>nul
if not errorlevel 1 (
    echo C++ compiler detectat in PATH.
    exit /b 0
)

echo Visual Studio Build Tools nu pare instalat.
echo Instalez Visual Studio 2022 Build Tools cu workload C++...
echo Este posibil sa apara o fereastra UAC sau sa dureze cateva minute.
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
if errorlevel 1 (
    echo Instalarea automata Visual Studio Build Tools a esuat.
    echo Instaleaza manual "Visual Studio Build Tools 2022" cu workload "Desktop development with C++".
    exit /b 1
)
set "NEEDS_NEW_TERMINAL=1"
exit /b 0

:configureNpmPython
echo.
echo Configurez Python pentru npm/node-gyp...
set "PYTHON_PATH="
for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON_PATH=%%P"
if not defined PYTHON_PATH (
    for /f "delims=" %%P in ('python -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON_PATH=%%P"
)
if defined PYTHON_PATH (
    echo Python folosit de npm: %PYTHON_PATH%
    call npm.cmd config set python "%PYTHON_PATH%" >nul 2>nul
) else (
    echo Nu am putut determina calea Python. Continui, dar node-gyp poate esua.
)

if "%NEEDS_NEW_TERMINAL%"=="1" (
    echo.
    echo ATENTIE: Unele tool-uri au fost instalate acum.
    echo Daca npm install esueaza, inchide terminalul si ruleaza din nou acest .bat.
)
exit /b 0

:removeNodeModules
if exist "node_modules" (
    echo Sterg node_modules...
    rmdir /s /q node_modules 2>nul
    if exist "node_modules" (
        echo Nu am putut sterge complet node_modules. Incerc cu PowerShell...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath 'node_modules' -Recurse -Force -ErrorAction SilentlyContinue"
    )
)
if exist "package-lock.json" (
    echo Sterg package-lock.json pentru reinstalare curata...
    del /f /q package-lock.json 2>nul
)
exit /b 0

:manualSetupRequired
echo.
echo Nu am putut finaliza instalarea automata.
echo Verifica mesajul de eroare de mai sus, apoi ruleaza din nou F1GuesserDuel.bat.
pause
exit /b 1
