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

set commitmsg=force commit %yyyy%-%mm%-%dd% %hh%:%min%

git add -A
git commit -m "%commitmsg%"

git push --force-with-lease origin main

echo Done: remote main overwritten by your local main.
pause
