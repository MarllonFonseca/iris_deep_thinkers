@echo off
REM Windows: double-click to open the app WITHOUT internet.
REM Starts a local server (http://localhost:8000); servidor.py stops the browser keeping old copies.
cd /d "%~dp0"
echo Opening the app at http://localhost:8000/app/visao/Main.html (close this window to stop)
start "" "http://localhost:8000/app/visao/Main.html"
python servidor.py 8000
