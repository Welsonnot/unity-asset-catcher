import os
import sys
import subprocess
import threading
import time

# Auto-install missing dependencies on startup.
def install_dependencies():
    required_packages = ['flask', 'flask-cors', 'Pillow']
    installed_any = False
    for package in required_packages:
        try:
            if package == 'Pillow':
                import PIL
            elif package == 'flask-cors':
                import flask_cors
            else:
                __import__(package)
        except ImportError:
            print(f"[*] Missing package '{package}'. Attempting automatic installation...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", package])
                installed_any = True
                print(f"[+] Successfully installed '{package}'")
            except Exception as e:
                print(f"[!] Error installing '{package}': {e}")
                print(f"[!] Please run: pip install {package}")
    if installed_any:
        print("[+] All dependencies checked and updated. Reloading modules...")

# Auto-open browser in a separate thread. Wait for Flask to start.
def open_browser():
    time.sleep(1.5)
    import webbrowser
    webbrowser.open("http://127.0.0.1:5000")

if __name__ == '__main__':
    # Initialize workspace dependencies
    install_dependencies()
    
    # Import modular routes package after ensuring imports are present
    from backend.routes import app
    from backend.config import DEFAULT_OUTPUT_DIR, WORKSPACE_DIR
    
    # Make sure default paths are created
    os.makedirs(os.path.join(WORKSPACE_DIR, 'frontend', 'templates'), exist_ok=True)
    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
    
    print("\n" + "="*50)
    print(" UNITY ASSET PIPELINE SERVER INITIALIZING")
    print("="*50)
    print(f"[*] Workspace: {WORKSPACE_DIR}")
    print(f"[*] Default Output Path: {DEFAULT_OUTPUT_DIR}")
    print("[*] Starting browser launcher...")
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run modular server on port 5000
    app.run(host='127.0.0.1', port=5000, debug=False)
