@echo off
echo Building LetterForge Pro with Admin privileges...
echo.

REM Clean electron-builder cache
echo Cleaning cache...
powershell -Command "Remove-Item -Path '%LOCALAPPDATA%\electron-builder\Cache' -Recurse -Force -ErrorAction SilentlyContinue"

REM Build with electron-builder (NSIS)
echo Building NSIS installer...
npx electron-builder --win --publish never

echo.
echo Build completed!
echo Output: dist\LetterForge Pro Setup 4.0.1.exe
pause
