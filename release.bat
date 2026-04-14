@echo off
REM ==========================================
REM LetterForge Pro - Build and Release Script
REM ==========================================

echo.
echo ========================================
echo  LetterForge Pro - Build ^& Release
echo ========================================
echo.

REM Check if GITHUB_TOKEN is set
if "%GITHUB_TOKEN%"=="" (
    echo [ERROR] GITHUB_TOKEN non impostato!
    echo.
    echo Per favore imposta il token GitHub:
    echo.
    echo   set GITHUB_TOKEN=ghp_XXXXXXXXXXXXXXXXXXXX
    echo.
    echo Poi esegui di nuovo questo script.
    echo.
    pause
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js non trovato!
    echo.
    echo Per favore installa Node.js da:
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [INFO] Node.js version:
node --version
echo.

REM Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installazione dipendenze...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Installazione fallita!
        pause
        exit /b 1
    )
)

REM Build and publish
echo [INFO] Build e publish in corso...
echo.
echo Questo creera':
echo   - LetterForge Pro Setup.exe (installer)
echo   - latest.yml (auto-update metadata)
echo   - blockmap (differential update)
echo.
echo E carichera' tutto su GitHub Releases.
echo.
pause

call npm run release

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build fallito!
    echo.
    echo Possibili cause:
    echo   1. Token GitHub non valido
    echo   2. Permessi insufficienti sul repository
    echo   3. Errori di compilazione
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  Build completato con successo!
echo ========================================
echo.
echo Controlla il release su:
echo   https://github.com/S1mone01/LetterForge/releases
echo.
pause
