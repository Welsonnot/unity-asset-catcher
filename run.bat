@echo off
title Unity Asset Fetcher
echo [*] Checking local environment...

:: Installs and provisions a local venv environment if missing
if not exist venv (
    echo [*] Creating fresh Python Virtual Environment...
    python -m venv venv
)

:: Activates environment and provisions tracking dependencies
call venv\Scripts\activate
echo [*] Verifying application dependencies...
pip install -r requirements.txt --quiet

echo [*] Bootstrapping Unity Asset Fetcher Dashboard...
python app.py
pause
