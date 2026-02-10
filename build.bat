@echo off
REM Figma Plugin Build Script (Windows PowerShell)

echo.
echo ^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=
echo   Figma Plugin Build Starting...
echo ^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=
echo.

REM Check dependencies
if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [!] npm install failed
        exit /b 1
    )
)

REM Compile TypeScript
echo [*] Compiling TypeScript...
    call npx tsc
if errorlevel 1 (
    echo [!] TypeScript compilation failed
)

REM Check if code.js file was created
if exist "code.js" (
    echo [+] code.js created successfully
) else (
    echo [!] code.js could not be created
    exit /b 1
)

REM Check HTML file
if exist "ui.html" (
    echo [+] ui.html file found
) else (
    echo [?] ui.html file not found (but not required)
)

REM Check manifest
if exist "manifest.json" (
    echo [+] manifest.json file found
) else (
    echo [!] manifest.json file required!
    exit /b 1
)

echo.
echo ^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=
echo   Build Completed!
echo ^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=^=
echo.
echo Next Steps:
echo   1. Open Figma
echo   2. Plugins -^> Development -^> New plugin
echo   3. Select manifest.json file
echo   4. Observe the plugin panel opening
echo.
echo Automatic Compilation During Development:
echo   npm run watch
echo.

pause
