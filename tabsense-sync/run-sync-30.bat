@echo off
cd /d "%~dp0"
echo [%date% %time%] Starting sync for 07/30/2026... >> sync-30.log
node pull-tabsense.js 07/30/2026 >> sync-30.log 2>&1
echo [%date% %time%] Done. >> sync-30.log
