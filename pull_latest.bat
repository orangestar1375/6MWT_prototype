@echo off
cd /d "%~dp0"

git fetch origin
git reset --hard origin/main

echo Local repo is now exactly origin/main
pause
