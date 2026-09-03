@echo off
setlocal

REM SATUSEHAT Dashboard - Windows production kiosk
REM Edit URL if the application is served from another path/host.
set "URL=http://localhost/"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME%" (
    echo Google Chrome was not found.
    echo Install Chrome or update the CHROME variable in this file.
    pause
    exit /b 1
)

start "SATUSEHAT Dashboard" "%CHROME%" --kiosk --start-fullscreen --no-first-run --disable-session-crashed-bubble --disable-infobars "%URL%"
endlocal
