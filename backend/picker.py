import os

# Open system directory picker window topmost
def open_directory_picker():
    import tkinter as tk
    from tkinter import filedialog
    
    # Hide root window
    root = tk.Tk()
    root.withdraw()
    
    # Force dialog to be topmost
    root.wm_attributes('-topmost', 1)
    selected_dir = filedialog.askdirectory(title="Select Destination Directory")
    root.destroy()
    
    if selected_dir:
        return os.path.normpath(selected_dir)
    return ""
