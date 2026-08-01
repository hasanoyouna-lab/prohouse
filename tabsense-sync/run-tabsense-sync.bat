@echo off
cd /d "%~dp0"
echo [%date% %time%] Starting daily sync... >> sync.log
node pull-tabsense.js >> sync.log 2>&1
echo [%date% %time%] Done. >> sync.log
