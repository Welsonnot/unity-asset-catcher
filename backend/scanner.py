import os
from pathlib import Path
from backend.config import STEAM_APP_IDS

# Rust Path Auto-Detection
def detect_rust_bundles():
    drives = ['C', 'D', 'E', 'F', 'G']
    relative_paths = [
        r"Steam\steamapps\common\Rust\Bundles",
        r"Program Files (x86)\Steam\steamapps\common\Rust\Bundles",
        r"SteamLibrary\steamapps\common\Rust\Bundles",
        r"Games\Rust\Bundles"
    ]
    for drive in drives:
        for rel in relative_paths:
            full_path = Path(f"{drive}:\\") / rel
            if full_path.exists() and full_path.is_dir():
                return str(full_path.resolve())
    return ""

# Steam Library Unity Games Scanner
def detect_steam_games():
    drives = ['C', 'D', 'E', 'F', 'G']
    common_paths = []
    for drive in drives:
        paths = [
            Path(f"{drive}:\\Steam\\steamapps\\common"),
            Path(f"{drive}:\\Program Files (x86)\\Steam\\steamapps\\common"),
            Path(f"{drive}:\\SteamLibrary\\steamapps\\common"),
            Path(f"{drive}:\\Games\\steamapps\\common")
        ]
        for p in paths:
            if p.exists() and p.is_dir():
                common_paths.append(p)
                
    detected_games = []
    
    # Scan each steam common directory
    for common_path in common_paths:
        try:
            for game_dir in common_path.iterdir():
                if game_dir.is_dir():
                    is_unity = False
                    has_direct_items = False
                    bundles_path = ""
                    
                    # 1. Check for Rust-style direct cache (items/ folder)
                    rust_items_dir = game_dir / "Bundles" / "items"
                    if rust_items_dir.exists() and rust_items_dir.is_dir():
                        has_direct_items = True
                        is_unity = True
                        bundles_path = str((game_dir / "Bundles").resolve())
                    else:
                        # 2. Check for generic Unity game indicators
                        for item in game_dir.iterdir():
                            if item.is_dir() and item.name.endswith("_Data"):
                                is_unity = True
                            elif item.is_file() and item.name in ["UnityPlayer.dll", "UnityCrashHandler64.exe", "UnityCrashHandler32.exe"]:
                                is_unity = True
                                
                        # Resolve best bundles path for a generic Unity game
                        generic_bundles = game_dir / "Bundles"
                        if generic_bundles.exists() and generic_bundles.is_dir():
                            bundles_path = str(generic_bundles.resolve())
                        else:
                            data_dirs = [x for x in game_dir.iterdir() if x.is_dir() and x.name.endswith("_Data")]
                            if data_dirs:
                                bundles_path = str(data_dirs[0].resolve())
                            else:
                                bundles_path = str(game_dir.resolve())
                                
                    if is_unity:
                        status = "Compatible Cache" if has_direct_items else "Unity Game (No direct cache)"
                        detected_games.append({
                            "name": game_dir.name,
                            "path": bundles_path,
                            "root_path": str(game_dir.resolve()),
                            "status": status,
                            "compatible": has_direct_items
                        })
        except Exception:
            continue
            
    # Deduplicate by root_path
    unique_games = {}
    for g in detected_games:
        unique_games[g["root_path"]] = g
        
    # Sort games so Fully Compatible ones appear first, then alphabetically by name
    sorted_games = sorted(
        unique_games.values(),
        key=lambda x: (0 if x["compatible"] else 1, x["name"].lower())
    )
    return sorted_games

# Fallback scanner for Steam Workshop and AppData\LocalLow directories
def find_adaptive_assets(source_path, game_name, logger=None):
    source_path = Path(source_path)
    name_clean = game_name.lower().strip()
    clean_key = "".join([c for c in name_clean if c.isalnum()])
    app_id = STEAM_APP_IDS.get(name_clean) or STEAM_APP_IDS.get(clean_key)
    
    png_files = []
    
    # 1. Search Steam Workshop Path
    if app_id:
        steamapps_path = None
        for parent in source_path.parents:
            if parent.name.lower() == "steamapps":
                steamapps_path = parent
                break
                
        if steamapps_path:
            workshop_path = steamapps_path / "workshop" / "content" / str(app_id)
            if workshop_path.exists() and workshop_path.is_dir():
                if logger:
                    logger(f"[Adaptive Scanner] Game has 0 local assets in main folder. Found workshop directory at '{workshop_path}'. Scanning...")
                for root, dirs, files in os.walk(workshop_path):
                    for file in files:
                        if file.lower().endswith(".png"):
                            png_files.append(Path(root) / file)
                            if len(png_files) >= 500:
                                break
                    if len(png_files) >= 500:
                        break
                        
    # 2. Search AppData\LocalLow Path
    if len(png_files) == 0:
        appdata = os.environ.get('APPDATA')
        if appdata:
            locallow_path = Path(appdata).parent / "LocalLow"
            if locallow_path.exists() and locallow_path.is_dir():
                target_dirs = []
                try:
                    for dev_dir in locallow_path.iterdir():
                        if dev_dir.is_dir():
                            for sub_dir in dev_dir.iterdir():
                                if sub_dir.is_dir() and (name_clean in sub_dir.name.lower() or clean_key in sub_dir.name.lower() or sub_dir.name.lower() in name_clean):
                                    target_dirs.append(sub_dir)
                except Exception:
                    pass
                    
                if not target_dirs:
                    try:
                        for dev_dir in locallow_path.iterdir():
                            if dev_dir.is_dir() and (name_clean in dev_dir.name.lower() or clean_key in dev_dir.name.lower()):
                                  target_dirs.append(dev_dir)
                    except Exception:
                        pass
                        
                if target_dirs:
                    if logger:
                        logger(f"[Adaptive Scanner] Game has 0 local assets. Discovered AppData LocalLow target path(s) at: {', '.join([str(x) for x in target_dirs])}. Scanning...")
                    for target_dir in target_dirs:
                        for root, dirs, files in os.walk(target_dir):
                            for file in files:
                                if file.lower().endswith(".png"):
                                    png_files.append(Path(root) / file)
                                    if len(png_files) >= 500:
                                        break
                            if len(png_files) >= 500:
                                break
                        if len(png_files) >= 500:
                            break
                            
    return png_files

# Resolve category from item directory path
def determine_clean_category(png_path, game_root):
    try:
        rel_parts = [p.lower() for p in png_path.relative_to(game_root).parts]
    except Exception:
        rel_parts = [p.lower() for p in png_path.parts]
        
    parts_set = set(rel_parts)
    
    # 1. Custom Crosshairs
    if "custom_crosshair" in parts_set or "crosshairs" in parts_set or "crosshair" in parts_set:
        return "Custom Crosshairs"
        
    # 2. Playlists
    if "playlisticons" in parts_set or "playlists" in parts_set or "playlist" in parts_set:
        return "Playlist Icons"
        
    # 3. Academy / Tasks
    if "academytasks" in parts_set or "academy" in parts_set:
        return "Academy Tasks"
        
    # 4. Bots
    if "bots" in parts_set or any(x.startswith("csbot") for x in parts_set):
        return "Bots"
        
    # 5. Rivals
    if "rivals" in parts_set or any("rivals" in x for x in parts_set):
        return "Rivals Tasks"
        
    # Generic Fallback
    try:
        rel_parts_raw = png_path.relative_to(game_root).parts
        if len(rel_parts_raw) > 1:
            first_dir = rel_parts_raw[0]
            if first_dir.lower() == "users" and len(rel_parts_raw) > 2:
                return rel_parts_raw[2].replace("_", " ").title()
            return first_dir.replace("_", " ").title()
    except Exception:
        pass
        
    parent_name = png_path.parent.name
    return parent_name.replace("_", " ").replace(".", " ").title()

# Resolve game name from folder directory path
def get_game_name_from_path(source_dir):
    if not source_dir:
        return "Rust"
    source_path = Path(source_dir)
    parts = source_path.parts
    game_name = "Rust"
    
    if "common" in parts:
        idx = parts.index("common")
        if idx + 1 < len(parts):
            game_name = parts[idx + 1]
    else:
        if source_path.name in ["Bundles", "items"] or source_path.name.endswith("_Data"):
            game_name = source_path.parent.name
        else:
            game_name = source_path.name
            
    cleaned = "".join([c for c in game_name if c.isalnum() or c in [' ', '_', '-']]).strip()
    return cleaned or "Rust"
