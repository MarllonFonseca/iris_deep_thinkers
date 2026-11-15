#!/bin/bash
# Mac: double-click to open the app WITHOUT internet.
# Starts a small local server (http://localhost:8000): the browser does not allow
# the camera or loading the models from file://. servidor.py also stops the browser
# from keeping old copies of the files.
cd "$(dirname "$0")"
PORTA=8000
echo "Opening the app at http://localhost:$PORTA/app/visao/Main.html (close this window to stop)"
( sleep 1; open "http://localhost:$PORTA/app/visao/Main.html" ) &
python3 servidor.py $PORTA
