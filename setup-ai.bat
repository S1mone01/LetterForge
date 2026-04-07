@echo off
echo ========================================
echo   LetterForge Pro - AI Setup
echo ========================================
echo.
echo This will help you configure the AI Assistant
echo.
echo You'll need a DashScope API key from:
echo https://dashscope.console.aliyun.com/
echo.
pause

echo.
set /p API_KEY="Enter your DashScope API key (leave empty to skip): "

if "%API_KEY%"=="" (
    echo.
    echo Skipping API key configuration.
    echo You can set it later using:
    echo   set DASHSCOPE_API_KEY=your_key_here
    echo Or use the AI Config button in the app.
    echo.
    goto :start_app
)

echo.
echo Setting API key...
set DASHSCOPE_API_KEY=%API_KEY%
echo Done!
echo.

:start_app
echo Starting LetterForge Pro with AI enabled...
echo.
npm start
