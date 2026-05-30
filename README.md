# Unity Asset Fetcher & Gallery

[![GitHub release](https://img.shields.io/github/v/release/Welsonnot/unity-asset-catcher?color=blue&style=flat-square)](https://github.com/Welsonnot/unity-asset-catcher/releases)
[![GitHub license](https://img.shields.io/github/license/Welsonnot/unity-asset-catcher?color=green&style=flat-square)](https://github.com/Welsonnot/unity-asset-catcher/blob/main/LICENSE)

A local tool that extracts UI assets from Unity-based Steam games. Built with Flask + vanilla JS.

---

## Features

- **Auto-installs dependencies on first run**: The launcher script automatically sets up a Python virtual environment and installs required packages in the background.
- **Custom game selector**: Dropdown menu that detects your installed compatible games and pulls their official Steam capsule banners.
- **Fallback scanner for Workshop and AppData**: Crawls Steam Workshop directories (`..\steamapps\workshop\content\`) and AppData folders (`AppData\LocalLow\`) if assets aren't in the main install path.
- **Category sorting**: Groups messy nested folder paths into broad category tags automatically.
- **Paginated asset gallery (24 per page)**: Renders asset grids in pages of 24 to prevent browser lag on large asset catalogs.
- **Asset preview modal with metadata**: Opens a detail inspector modal showing exact sizes, dimension info, companion JSON data, and in-game item descriptions.
- **Multi-game output organization**: Automatically isolates extracted assets into separate game folders within your chosen destination.

---

## Codebase Architecture

The project is structured logically across Python backend modules and clean frontend scripts:

```text
├── .github/                         # GitHub templates
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── scanner_request.md       # Configurations for new games
├── backend/                         # Backend Python package
│   ├── __init__.py
│   ├── config.py                    # Steam AppIDs and category paths
│   ├── scanner.py                   # Game detectors and file crawlers
│   ├── extractor.py                 # Multi-threaded copy logic
│   ├── picker.py                    # Folder selection dialog
│   └── routes.py                    # Flask server endpoints
├── frontend/                        # Frontend UI assets
│   ├── static/
│   │   ├── css/
│   │   │   └── dashboard.css        # Dashboard stylesheet
│   │   └── js/
│   │       ├── dropdown.js          # Custom dropdown logic
│   │       ├── pagination.js        # Gallery pagination logic
│   │       └── dashboard.js         # API polling, logs, and modal handlers
│   └── templates/
│       └── index.html               # Main HTML template
├── requirements.txt                 # Python dependencies
├── app.py                           # Application entry point
├── run.bat                          # One-click Windows launcher
└── run.sh                           # One-click macOS/Linux launcher
```

---

## Getting Started

### Windows
Double-click **`run.bat`** at the root of the repository. The batch file will:
1. Create a local virtual environment (`venv`) if it doesn't exist.
2. Install dependencies silently.
3. Start the Flask server on `http://127.0.0.1:5000`.
4. Open the interface in your default browser.

### macOS / Linux
Open your terminal in the project directory and run:
```bash
chmod +x run.sh
./run.sh
```

### Manual Installation
If you prefer manual setup, run these commands in your console:

```bash
# Clone the repository
git clone https://github.com/Welsonnot/unity-asset-catcher.git
cd unity-asset-catcher

# Setup virtual environment
python -m venv venv

# Activate environment
# On Windows:
.\venv\Scripts\activate
# On macOS / Linux:
source venv/bin/activate

# Install requirements & run
pip install -r requirements.txt
python app.py
```

---

## Contributing

Pull Requests are welcome. To add path configurations or rules for a new game, please submit an issue requesting support or make a PR updating the configurations in `backend/config.py`.

---

## Disclaimer & Fair Use Notice

This tool only reads locally-installed files. All extracted assets belong to their respective publishers. Use responsibly.

---

## License

Distributed under the **MIT License**. See `LICENSE` for more details.
