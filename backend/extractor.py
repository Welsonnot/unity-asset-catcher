import os
import time
import shutil
import threading
from pathlib import Path
from PIL import Image

from backend.config import CATEGORY_FOLDER_MAP, resolve_category, UNITY_SCAN_EXCLUDE_DIRS
from backend.scanner import find_adaptive_assets, determine_clean_category, get_game_name_from_path

# Thread-safe global state for tracking extraction status
class ExtractionStatus:
    def __init__(self):
        self.is_running = False
        self.phase = "idle"  # idle, indexing, extracting, completed, error
        self.files_scanned = 0
        self.bundles_inspected = 0
        self.icons_extracted = 0
        self.current_file = ""
        self.error_message = ""
        self.start_time = 0.0
        self.elapsed_time = 0.0
        self.logs = []
        self.extracted_items = []  # list of {"name": "...", "size": "...", "dimensions": "...", "url": "...", "category": "..."}
        self.lock = threading.Lock()
        self.cancel_requested = False
        self.active_dest_dir = ""

    def log(self, message):
        timestamp = time.strftime("%H:%M:%S")
        formatted = f"[{timestamp}] {message}"
        with self.lock:
            self.logs.append(formatted)
            if len(self.logs) > 500:
                self.logs.pop(0)
        print(formatted)

    def update(self, **kwargs):
        with self.lock:
            for k, v in kwargs.items():
                setattr(self, k, v)

    def add_extracted(self, name, size_bytes, dimensions, url, category):
        with self.lock:
            self.extracted_items.append({
                "name": name,
                "size": f"{size_bytes / 1024:.1f} KB",
                "dimensions": f"{dimensions[0]}x{dimensions[1]}",
                "url": url,
                "category": category
            })

    def get_snapshot(self):
        with self.lock:
            if self.is_running and self.start_time > 0:
                self.elapsed_time = time.time() - self.start_time
            return {
                "is_running": self.is_running,
                "phase": self.phase,
                "files_scanned": self.files_scanned,
                "bundles_inspected": self.bundles_inspected,
                "icons_extracted": self.icons_extracted,
                "current_file": self.current_file,
                "error_message": self.error_message,
                "elapsed_time": f"{self.elapsed_time:.1f}s",
                "logs": list(self.logs),
                "extracted_items": list(self.extracted_items),
                "cancel_requested": self.cancel_requested
            }

global_status = ExtractionStatus()

# Extraction Pipeline Thread Worker
def extraction_worker(source_dir, dest_dir, selected_categories):
    global_status.update(
        is_running=True,
        phase="extracting",
        files_scanned=0,
        bundles_inspected=0,
        icons_extracted=0,
        current_file="",
        error_message="",
        start_time=time.time(),
        elapsed_time=0.0,
        extracted_items=[],
        logs=[],
        active_dest_dir=dest_dir,
        cancel_requested=False
    )
    
    game_name = get_game_name_from_path(source_dir)
    global_status.log(f"Starting Dynamic Asset Extraction Pipeline for [{game_name}]...")
    global_status.log(f"Source Directory: {source_dir}")
    global_status.log(f"Destination Directory: {dest_dir}")
    global_status.log(f"Selected Categories to extract: {', '.join(selected_categories)}")
    
    try:
        source_path = Path(source_dir)
        dest_path = Path(dest_dir)
        
        game_dest_path = dest_path / game_name
        game_dest_path.mkdir(parents=True, exist_ok=True)
        
        items_dir = source_path / "items"
        is_rust_style = items_dir.exists() and items_dir.is_dir()
        
        if is_rust_style:
            import json
            files = [f for f in os.listdir(items_dir) if f.endswith(".png")]
            total_items = len(files)
            global_status.log(f"Indexing {total_items} items in Rust database...")
            
            for file in files:
                if global_status.cancel_requested:
                    global_status.log("[!] Extraction cancelled by user.")
                    break
                    
                global_status.update(files_scanned=global_status.files_scanned + 1)
                
                # Read companion JSON to identify its exact category
                json_file = items_dir / file.replace(".png", ".json")
                if json_file.exists():
                    try:
                        with open(json_file, 'r', encoding='utf-8') as f:
                            meta = json.load(f)
                            raw_cat = meta.get("Category", "Misc")
                            shortname = file.replace(".png", "")
                            cat = resolve_category(shortname, raw_cat)
                            
                            # Check if this item's category was selected by the user
                            if cat in selected_categories:
                                global_status.update(current_file=f"items/{file}")
                                
                                # Determine subfolder name
                                subfolder_name = CATEGORY_FOLDER_MAP.get(cat, cat.lower())
                                subfolder_path = game_dest_path / subfolder_name
                                subfolder_path.mkdir(parents=True, exist_ok=True)
                                
                                src_file = items_dir / file
                                dst_file = subfolder_path / file
                                
                                # Incremental copy: Only copy if it doesn't exist yet!
                                is_new = not dst_file.exists()
                                if is_new:
                                    shutil.copy2(src_file, dst_file)
                                    size = dst_file.stat().st_size
                                    with Image.open(dst_file) as img:
                                        w, h = img.size
                                        global_status.update(icons_extracted=global_status.icons_extracted + 1)
                                        global_status.add_extracted(
                                            file, 
                                            size, 
                                            (w, h), 
                                            f"/extracted_assets/{game_name}/{subfolder_name}/{file}", 
                                            cat
                                        )
                                        if global_status.icons_extracted % 20 == 0:
                                            global_status.log(f"[Extractor] Saved {global_status.icons_extracted} transparent assets...")
                                else:
                                    size = dst_file.stat().st_size
                                    with Image.open(dst_file) as img:
                                        w, h = img.size
                                        global_status.add_extracted(
                                            file, 
                                            size, 
                                            (w, h), 
                                            f"/extracted_assets/{game_name}/{subfolder_name}/{file}", 
                                            cat
                                        )
                    except Exception:
                        continue
        else:
            # Generic Unity scanner extraction
            global_status.log("Extracting assets for compatible generic Unity game...")
            game_root = source_path.parent if source_path.name == "Bundles" or source_path.name.endswith("_Data") else source_path
            
            png_files = []
            for root, dirs, files in os.walk(game_root):
                if any(x in root for x in UNITY_SCAN_EXCLUDE_DIRS):
                    continue
                for file in files:
                    if file.lower().endswith(".png"):
                        png_files.append(Path(root) / file)
                        
            # Adapt scan fallback if 0 files discovered directly
            if len(png_files) == 0:
                png_files = find_adaptive_assets(source_path, game_name, global_status.log)
                
            total_items = len(png_files)
            global_status.log(f"Found {total_items} total image assets to scan.")
            
            for src_file in png_files:
                if global_status.cancel_requested:
                    global_status.log("[!] Extraction cancelled by user.")
                    break
                    
                global_status.update(files_scanned=global_status.files_scanned + 1)
                
                # Determine clean category dynamically
                cat = determine_clean_category(src_file, game_root)
                
                try:
                    rel_path_str = str(src_file.relative_to(game_root))
                except Exception:
                    rel_path_str = f"{cat}/{src_file.name}"
                    
                if cat in selected_categories:
                    global_status.update(current_file=rel_path_str)
                    
                    subfolder_name = CATEGORY_FOLDER_MAP.get(cat, cat.lower().replace(" ", "_"))
                    subfolder_path = game_dest_path / subfolder_name
                    subfolder_path.mkdir(parents=True, exist_ok=True)
                    
                    file_name = src_file.name
                    dst_file = subfolder_path / file_name
                    
                    try:
                        is_new = not dst_file.exists()
                        if is_new:
                            shutil.copy2(src_file, dst_file)
                            size = dst_file.stat().st_size
                            with Image.open(dst_file) as img:
                                w, h = img.size
                                global_status.update(icons_extracted=global_status.icons_extracted + 1)
                                global_status.add_extracted(
                                    file_name, 
                                    size, 
                                    (w, h), 
                                    f"/extracted_assets/{game_name}/{subfolder_name}/{file_name}", 
                                    cat
                                )
                                if global_status.icons_extracted % 20 == 0:
                                    global_status.log(f"[Extractor] Saved {global_status.icons_extracted} assets...")
                        else:
                            size = dst_file.stat().st_size
                            with Image.open(dst_file) as img:
                                w, h = img.size
                                global_status.add_extracted(
                                    file_name, 
                                    size, 
                                    (w, h), 
                                    f"/extracted_assets/{game_name}/{subfolder_name}/{file_name}", 
                                    cat
                                )
                    except Exception:
                        continue
                        
        # Complete
        global_status.update(phase="completed", is_running=False)
        global_status.log(f"[system] Pipeline completed. Mapped/Extracted {global_status.icons_extracted} new assets into '{game_name}' subfolders.")
        global_status.log("[system] Conserved disk space & CPU: All assets successfully copied incrementally.")
        
        # Automatically launch system File Explorer to show the newly sorted assets!
        try:
            import platform
            import subprocess
            
            target_open = str(game_dest_path.resolve())
            global_status.log(f"[system] Launching system file explorer to open folder: '{target_open}'")
            
            if platform.system() == "Windows":
                os.startfile(target_open)
            elif platform.system() == "Darwin":  # macOS Finder
                subprocess.Popen(["open", target_open])
            else:  # Linux xdg-open
                subprocess.Popen(["xdg-open", target_open])
        except Exception as explorer_err:
            global_status.log(f"[system] Note: Could not auto-open folder: {explorer_err}")
            
    except Exception as pipeline_err:
        global_status.update(phase="error", is_running=False, error_message=str(pipeline_err))
        global_status.log(f"[!] CRITICAL ERROR in extraction thread: {pipeline_err}")
