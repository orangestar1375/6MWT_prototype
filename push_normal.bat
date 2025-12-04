@echo off
cd /d "%~dp0"

:: 日付・時刻（YYYY-MM-DD HH:MM）
for /f "tokens=1-3 delims=/-" %%a in ("%date%") do (
    set yyyy=%%a
    set mm=%%b
    set dd=%%c
)

for /f "tokens=1-3 delims=:." %%a in ("%time%") do (
    set hh=%%a
    set min=%%b
    set ss=%%c
)

set commitmsg=auto commit %yyyy%-%mm%-%dd% %hh%:%min%

git add -A
git commit -m "%commitmsg%"
git push origin main

echo done
pause
