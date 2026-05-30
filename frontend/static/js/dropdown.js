// ========================================================
// Steam Capsule Custom Dropdown Widget JavaScript Logic
// Hand-written for custom dropdown capsules. No generic HTML select widgets here!
// ========================================================

// Steam App IDs Mapping
// We use these IDs to hit Steam's CDN and fetch capsule graphics dynamically.
const STEAM_APP_IDS = {
    "rust": "252490",
    "aim lab": "714010",
    "aimlab": "714010",
    "car mechanic simulator 2021": "1190000",
    "carmechanicsimulator2021": "1190000",
    "valheim": "892970",
    "phasmophobia": "739630",
    "cuphead": "268910",
    "hollow knight": "367520",
    "hollowknight": "367520",
    "7 days to die": "251570",
    "7daystodie": "251570",
    "cities skylines": "255710",
    "citiesskylines": "255710",
    "subnautica": "264710",
    "the forest": "242760",
    "theforest": "242760",
    "unturned": "304930",
    "v rising": "1604030",
    "vrising": "1604030",
    "risk of rain 2": "632360",
    "riskofrain2": "632360"
};

// Toggle custom dropdown menu visibility
function toggleDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('game-dropdown');
    if (dropdown) dropdown.classList.toggle('open');
}

// Close custom dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('game-dropdown');
    if (dropdown && !dropdown.contains(event.target)) {
        dropdown.classList.remove('open');
    }
});

// Fetch detected games from local backend Steam scanner
async function fetchDetectedGames() {
    try {
        const response = await fetch('/api/detect_games');
        if (!response.ok) return;
        const data = await response.json();
        
        if (data.status === "success" && data.games && data.games.length > 0) {
            const menu = document.getElementById('dropdown-menu');
            if (!menu) return;
            menu.innerHTML = '';
            
            data.games.forEach(game => {
                // Find Steam App ID
                const nameLower = game.name.toLowerCase().trim();
                const cleanKey = nameLower.replace(/[^a-z0-9]+/g, '');
                const appId = STEAM_APP_IDS[nameLower] || STEAM_APP_IDS[cleanKey] || null;
                
                let imgHtml = '';
                if (appId) {
                    imgHtml = `<img src="https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg" alt="${game.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                               <i class="fa-solid fa-gamepad" style="display: none;"></i>`;
                } else {
                    const isUnity = game.status.toLowerCase().includes('unity');
                    const iconClass = isUnity ? 'fa-brands fa-unity' : 'fa-solid fa-gamepad';
                    imgHtml = `<i class="${iconClass}"></i>`;
                }
                
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectGameItem(game.path, game.name, appId, game.compatible);
                };
                
                item.innerHTML = `
                    <div class="item-capsule">
                        ${imgHtml}
                    </div>
                    <div class="item-details">
                        <span class="item-name">${game.name}</span>
                        <span class="item-status ${game.compatible ? 'compatible' : ''}">${game.status}</span>
                    </div>
                `;
                menu.appendChild(item);
            });
            
            const dropdownWrap = document.getElementById('game-dropdown');
            if (dropdownWrap) dropdownWrap.style.display = 'inline-block';

            // Auto-select the first fully compatible game (Rust sorts to the top)
            const firstCompatible = data.games.find(g => g.compatible);
            if (firstCompatible) {
                const appId = STEAM_APP_IDS[firstCompatible.name.toLowerCase().trim()] || null;
                selectGameItem(firstCompatible.path, firstCompatible.name, appId, firstCompatible.compatible);
            }

        }
    } catch (err) {
        console.error("Failed to detect Steam games:", err);
    }
}

// Select a game inside the custom dropdown widget
function selectGameItem(path, name, appId, compatible) {
    const srcInput = document.getElementById('source-path');
    if (srcInput) srcInput.value = path;
    
    // Close dropdown
    const dropdown = document.getElementById('game-dropdown');
    if (dropdown) dropdown.classList.remove('open');
    
    // Update dropdown trigger UI
    const triggerText = document.getElementById('trigger-text');
    const triggerLogo = document.getElementById('trigger-logo');
    
    if (triggerText) triggerText.textContent = name + (compatible ? ' (Fast Cache)' : ' (Unity Game)');
    
    if (triggerLogo) {
        if (appId) {
            triggerLogo.innerHTML = `<img src="https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg" alt="${name}">`;
        } else {
            const iconClass = name.toLowerCase().includes('unity') ? 'fa-brands fa-unity' : 'fa-solid fa-gamepad';
            triggerLogo.innerHTML = `<i class="${iconClass}"></i>`;
        }
    }
    
    // Convert game name to clean lowercase folder tag
    let cleanName = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const folderName = cleanName + "_icons";
    
    let currentDest = document.getElementById('dest-path').value.trim();
    if (currentDest) {
        const assetsIdx = currentDest.toLowerCase().indexOf('assets');
        if (assetsIdx !== -1) {
            const basePart = currentDest.substring(0, assetsIdx + 6); // Includes "assets"
            const separator = currentDest.includes('\\') ? '\\' : '/';
            document.getElementById('dest-path').value = basePart + separator + folderName;
        } else {
            const separator = currentDest.includes('\\') ? '\\' : '/';
            const baseDir = currentDest.substring(0, currentDest.lastIndexOf(separator));
            document.getElementById('dest-path').value = baseDir + separator + folderName;
        }
    }
    
    showToast(`Aligned source & destination paths for ${name}`);
}
