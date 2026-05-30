#!/bin/bash
echo "[*] Checking local environment..."

# Installs and provisions a local venv environment if missing
if [ ! -d "venv" ]; then
    echo "[*] Creating fresh Python Virtual Environment..."
    python3 -m venv venv
fi

# Activates environment and provisions tracking dependencies
source venv/bin/activate
echo "[*] Verifying application dependencies..."
pip install -r requirements.txt --quiet

echo "[*] Bootstrapping Unity Asset Fetcher Dashboard..."
python3 app.py
