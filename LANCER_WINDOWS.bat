@echo off
title Dark Romance Draw
cd /d "%~dp0"
echo Lancement de Dark Romance Draw...
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  py lancer_sur_pc.py
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  python lancer_sur_pc.py
  exit /b
)
echo Python n'est pas installe sur ce PC.
echo Installe Python depuis python.org, puis relance ce fichier.
echo.
pause
