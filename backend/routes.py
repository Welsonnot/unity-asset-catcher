import os
import json
import base64
import shutil
import threading
from pathlib import Path
from flask import Flask, jsonify, request, render_template, send_from_directory
from flask_cors import CORS
from PIL import Image

# Config imports
from backend.config import DEFAULT_OUTPUT_DIR, CATEGORY_FOLDER_MAP, resolve_category
# Scanners imports
from backend.scanner import (
    detect_rust_bundles, 
    detect_steam_games, 
    find_adaptive_assets, 
    determine_clean_category,
    get_game_name_from_path
)
# Extractor imports
from backend.extractor import global_status, extraction_worker, active_dest_dir
# Folder picker imports
from backend.picker import open_directory_picker

# Resolve templates and static folders for Flask
BACKEND_DIR = Path(__file__).parent.resolve()
TEMPLATE_DIR = str((BACKEND_DIR / ".." / "frontend" / "templates").resolve())
STATIC_DIR = str((BACKEND_DIR / ".." / "frontend" / "static").resolve())

app = Flask(
    __name__,
    template_folder=TEMPLATE_DIR,
    static_folder=STATIC_DIR
)
CORS(app)

# Helper setter for active_dest_dir in routes module
def set_active_dest_dir(val):
    global active_dest_dir
    active_dest_dir = val

# Encode / decode paths for generic games
def encode_path(p):
    return base64.urlsafe_b64encode(str(p).encode('utf-8')).decode('utf-8')
    
def decode_path(s):
    return base64.urlsafe_b64decode(s.encode('utf-8')).decode('utf-8')

# Flask Endpoint Definitions
@app.route('/')
def home():
    detected_path = detect_rust_bundles()
    return render_template(
        'index.html',
        default_source=detected_path,
        default_dest=str(DEFAULT_OUTPUT_DIR)
    )

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify(global_status.get_snapshot()), 200

@app.route('/api/index', methods=['POST'])
def scan_categories():
    data = request.json or {}
    source_dir = data.get('source_dir', '').strip()
    
    if not source_dir:
        return jsonify({"status": "error", "message": "Source bundles directory is required!"}), 400
        
    source_path = Path(source_dir)
    items_dir = source_path / "items"
    is_rust_style = items_dir.exists() and items_dir.is_dir()
    
    try:
        categories_count = {}
        items_list = []
        
        if is_rust_style:
            # Fast Rust style scanner
            files = os.listdir(items_dir)
            for file in files:
                if file.endswith(".png"):
                    json_file = items_dir / file.replace(".png", ".json")
                    cat = "Misc"
                    shortname = file.replace(".png", "")
                    if json_file.exists():
                        try:
                            with open(json_file, 'r', encoding='utf-8') as f:
                                meta = json.load(f)
                                raw_cat = meta.get("Category", "Misc")
                                cat = resolve_category(shortname, raw_cat)
                        except Exception:
                            pass
                    
                    categories_count[cat] = categories_count.get(cat, 0) + 1
                    items_list.append({
                        "name": file,
                        "category": cat,
                        "url": f"/raw_assets/{file}"
                    })
        else:
            # Generic Unity scanner fallback: Walk directory for loose PNGs
            game_root = source_path.parent if source_path.name in ["Bundles", "items"] or source_path.name.endswith("_Data") else source_path
            
            if not game_root.exists() or not game_root.is_dir():
                return jsonify({"status": "error", "message": f"Game source directory '{game_root}' does not exist!"}), 400
                
            png_files = []
            for root, dirs, files in os.walk(game_root):
                if any(x in root for x in ["MonoBleedingEdge", "Diagnostics", "CrashReports", "Redis"]):
                    continue
                for file in files:
                    if file.lower().endswith(".png"):
                        png_files.append(Path(root) / file)
                        if len(png_files) >= 500:
                            break
                if len(png_files) >= 500:
                    break
                    
            # Step 1 & 2: Adaptive fallback lookup for Workshop or LocalLow paths
            if len(png_files) == 0:
                game_name = get_game_name_from_path(source_dir)
                png_files = find_adaptive_assets(source_path, game_name, global_status.log)
                    
            for png_path in png_files:
                cat = determine_clean_category(png_path, game_root)
                categories_count[cat] = categories_count.get(cat, 0) + 1
                name_str = png_path.name
                
                # Dynamic path base64 parameters
                b64_path = encode_path(png_path)
                
                items_list.append({
                    "name": name_str,
                    "category": cat,
                    "url": f"/raw_assets_generic/{b64_path}",
                    "full_path": str(png_path.resolve())
                })
                
        return jsonify({
            "status": "success",
            "categories": categories_count,
            "items": items_list
        }), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/extract', methods=['POST'])
def start_extraction():
    if global_status.is_running:
        return jsonify({"status": "error", "message": "Extraction pipeline is already running!"}), 400
        
    data = request.json or {}
    source_dir = data.get('source_dir', '').strip()
    dest_dir = data.get('dest_dir', '').strip()
    selected_categories = data.get('categories', [])
    
    if not source_dir:
        return jsonify({"status": "error", "message": "Source bundles directory is required!"}), 400
    if not dest_dir:
        dest_dir = str(DEFAULT_OUTPUT_DIR)
    if not selected_categories:
        return jsonify({"status": "error", "message": "At least one category must be selected!"}), 400
        
    source_path = Path(source_dir)
    if not source_path.exists() or not source_path.is_dir():
        return jsonify({"status": "error", "message": f"Source directory '{source_dir}' does not exist!"}), 400
        
    # Start extraction thread
    thread = threading.Thread(
        target=extraction_worker, 
        args=(source_dir, dest_dir, selected_categories, set_active_dest_dir)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({"status": "success", "message": "Extraction pipeline started successfully!"}), 200

@app.route('/api/cancel', methods=['POST'])
def cancel_extraction():
    if not global_status.is_running:
        return jsonify({"status": "error", "message": "No extraction pipeline is running!"}), 400
    global_status.update(cancel_requested=True)
    return jsonify({"status": "success", "message": "Cancellation request sent!"}), 200

@app.route('/api/browse_folder', methods=['POST'])
def browse_folder():
    try:
        selected_path = open_directory_picker()
        if selected_path:
            return jsonify({"status": "success", "path": selected_path}), 200
        else:
            return jsonify({"status": "cancelled", "message": "Folder selection cancelled."}), 200
    except Exception as err:
        return jsonify({"status": "error", "message": f"Could not launch folder picker: {err}"}), 500

@app.route('/api/detect_games', methods=['GET'])
def get_detected_games():
    try:
        games = detect_steam_games()
        return jsonify({"status": "success", "games": games}), 200
    except Exception as err:
        return jsonify({"status": "error", "message": str(err)}), 500

@app.route('/api/metadata/<path:filename>', methods=['GET'])
def get_metadata(filename):
    full_path_b64 = request.args.get('full_path_b64', '').strip()
    
    try:
        json_file = None
        if full_path_b64:
            try:
                src_png_path = Path(decode_path(full_path_b64))
                json_file = src_png_path.with_suffix(".json")
            except Exception:
                pass
        else:
            source_dir = detect_rust_bundles()
            if source_dir:
                filename = os.path.basename(filename)
                json_name = filename.replace(".png", ".json")
                json_file = Path(source_dir) / "items" / json_name
            
        if json_file and json_file.exists():
            with open(json_file, 'r', encoding='utf-8') as f:
                meta = json.load(f)
                return jsonify({"status": "success", "metadata": meta}), 200
        else:
            name_clean = os.path.basename(filename).replace(".png", "").replace(".", " ").title()
            return jsonify({
                "status": "success",
                "metadata": {
                    "Name": name_clean,
                    "shortname": os.path.basename(filename).replace(".png", ""),
                    "Category": "Assets",
                    "Description": "Generic Unity game asset file.",
                    "itemid": "N/A",
                    "rarity": "N/A",
                    "stackable": "N/A",
                    "ItemType": "Texture"
                }
            }), 200
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/extract_single', methods=['POST'])
def extract_single():
    global active_dest_dir
    data = request.json or {}
    filename = data.get('filename', '').strip()
    full_path_src = data.get('full_path', '').strip()
    dest_dir = data.get('dest_dir', '').strip()
    source_dir_to_use = data.get('source_dir', '').strip()
    
    if not filename:
        return jsonify({"status": "error", "message": "Filename is required"}), 400
    if not dest_dir:
        dest_dir = str(DEFAULT_OUTPUT_DIR)
        
    try:
        # Resolve source file
        if full_path_src and os.path.exists(full_path_src):
            src_file = Path(full_path_src)
        else:
            source_dir = source_dir_to_use or detect_rust_bundles()
            if not source_dir:
                return jsonify({"status": "error", "message": "Rust Bundles path not found"}), 404
            src_file = Path(source_dir) / "items" / filename
            
        if not src_file.exists():
            return jsonify({"status": "error", "message": f"Asset '{filename}' not found in game files"}), 404
            
        # Find category
        cat = "Misc"
        json_file = src_file.with_suffix(".json")
        if json_file.exists():
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                    cat = meta.get("Category", "Misc")
            except Exception:
                pass
                
        # If no JSON, use smart category determiner
        if cat == "Misc" and not json_file.exists():
            source_dir = source_dir_to_use or detect_rust_bundles()
            game_root = Path(source_dir).parent if source_dir and (Path(source_dir).name in ["Bundles", "items"] or Path(source_dir).name.endswith("_Data")) else Path(source_dir)
            cat = determine_clean_category(src_file, game_root)
            
        game_name = get_game_name_from_path(source_dir_to_use or (str(src_file.parent.parent) if full_path_src else ""))
        subfolder_name = CATEGORY_FOLDER_MAP.get(cat, cat.lower().replace(" ", "_"))
        dest_path = Path(dest_dir)
        
        set_active_dest_dir(str(dest_path))
            
        game_dest_subfolder = dest_path / game_name / subfolder_name
        game_dest_subfolder.mkdir(parents=True, exist_ok=True)
        
        dst_file = game_dest_subfolder / filename
        shutil.copy2(src_file, dst_file)
        
        size = dst_file.stat().st_size
        with Image.open(dst_file) as img:
            w, h = img.size
            
        global_status.add_extracted(
            filename,
            size,
            (w, h),
            f"/extracted_assets/{game_name}/{subfolder_name}/{filename}",
            cat
        )
        global_status.update(icons_extracted=global_status.icons_extracted + 1)
        
        return jsonify({
            "status": "success",
            "message": f"Successfully extracted '{filename}' to '{game_name}/{subfolder_name}/'",
            "extracted_item": {
                "name": filename,
                "size": f"{size / 1024:.1f} KB",
                "dimensions": f"{w}x{h}",
                "url": f"/extracted_assets/{game_name}/{subfolder_name}/{filename}",
                "category": cat
            }
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/extracted_assets/<path:filename>')
def serve_extracted_asset(filename):
    global active_dest_dir
    return send_from_directory(active_dest_dir, filename)

@app.route('/raw_assets_generic/<path_b64>')
def serve_raw_asset_generic(path_b64):
    try:
        full_path = decode_path(path_b64)
        if not os.path.exists(full_path):
            return "Asset file not found", 404
        directory = os.path.dirname(full_path)
        filename = os.path.basename(full_path)
        return send_from_directory(directory, filename)
    except Exception as err:
        return f"Error serving asset: {err}", 500

@app.route('/raw_assets/<path:filename>')
def serve_raw_asset(filename):
    source_dir = detect_rust_bundles()
    if not source_dir:
        return "Rust Bundles path not found", 404
    items_dir = Path(source_dir) / "items"
    return send_from_directory(items_dir, filename)
