@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 download_photos.py
  goto finished
)
where python >nul 2>nul
if %errorlevel% equ 0 (
  python download_photos.py
  goto finished
)
echo Python 3.9 or newer was not found.
echo Ask your project Codex to run download_photos.py with its Python interpreter.
:finished
echo.
echo Open preview.html after successful downloads.
pause
