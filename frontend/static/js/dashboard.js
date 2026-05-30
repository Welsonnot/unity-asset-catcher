// ========================================================
// Main dashboard APIs polling and scanner scripts
// ========================================================

let isRunning = false;
let lastLogCount = 0;
let activeFilter = 'all';
let scannedItems = [];      // Holds all previewable raw items after scanning
let savedItems = [];        // Holds the snapshotted extracted items (saved on disk)
let pollingInterval = null;
let discoveredCategories = {};
let manuallyRevealed = new Set(); // Track individual items manually previewed in the grid
let activeInspectorItem = null;   // Active item currently inside the inspector modal

// Poll status immediately
startPolling();
fetchDetectedGames();

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(pollServerStatus, 500);
}

async function pollServerStatus() {
    try {
        const response = await fetch('/api/status');
        if (!response.ok) return;
        const data = await response.json();

        updateStats(data);
        updateLogs(data.logs);
        
        // Track successfully extracted items on disk
        if (JSON.stringify(data.extracted_items) !== JSON.stringify(savedItems)) {
            savedItems = data.extracted_items;
            renderGalleryGrid();
        }

        if (data.is_running !== isRunning) {
            isRunning = data.is_running;
            toggleUIState(isRunning);
        }
    } catch (err) {
        console.error("Error connecting to server:", err);
    }
}

function toggleUIState(running) {
    const btnScan = document.getElementById('btn-scan');
    const btnAction = document.getElementById('btn-action');
    const sourceInput = document.getElementById('source-path');
    const destInput = document.getElementById('dest-path');
    const logTitle = document.getElementById('log-title');

    if (running) {
        if (btnAction) {
            btnAction.className = "btn btn-danger";
            btnAction.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Stop Extraction</span>`;
        }
        if (btnScan) btnScan.disabled = true;
        if (sourceInput) sourceInput.disabled = true;
        if (destInput) destInput.disabled = true;
        if (logTitle) logTitle.className = "log-title running";
    } else {
        if (btnAction) {
            btnAction.className = "btn btn-primary";
            btnAction.innerHTML = `<i class="fa-solid fa-play"></i> <span>Extract & Sort Selected</span>`;
        }
        if (btnScan) btnScan.disabled = false;
        if (sourceInput) sourceInput.disabled = false;
        if (destInput) destInput.disabled = false;
        if (logTitle) logTitle.className = "log-title";
    }
}

function updateStats(data) {
    const sScanned = document.getElementById('stat-scanned');
    const sBundles = document.getElementById('stat-bundles');
    const sExtracted = document.getElementById('stat-extracted');
    const sTime = document.getElementById('stat-time');

    if (sScanned) sScanned.innerText = data.files_scanned.toLocaleString();
    if (sBundles) sBundles.innerText = data.bundles_inspected.toLocaleString();
    if (sExtracted) sExtracted.innerText = data.icons_extracted.toLocaleString();
    if (sTime) sTime.innerText = data.elapsed_time;
}

function updateLogs(logs) {
    if (logs.length === lastLogCount) return;
    
    const body = document.getElementById('log-body');
    if (!body) return;
    
    const scrollLock = document.getElementById('scroll-lock');
    const autoScroll = scrollLock ? scrollLock.checked : true;
    
    for (let i = lastLogCount; i < logs.length; i++) {
        const line = document.createElement('div');
        const text = logs[i];
        line.className = 'log-line';
        
        if (text.includes('[system]') || text.includes('Initializing')) {
            line.classList.add('system');
        } else if (text.includes('[Extractor]') || text.includes('Extracted:') || text.includes('[Fast Copy]') || text.includes('[Adaptive Scanner]')) {
            line.classList.add('highlight');
        } else if (text.includes('completed') || text.includes('successfully')) {
            line.classList.add('success');
        } else if (text.includes('Warning') || text.includes('cancelled') || text.includes('halted')) {
            line.classList.add('system');
        } else if (text.includes('[!]') || text.includes('Error') || text.includes('CRITICAL')) {
            line.classList.add('error');
        }
        
        line.innerText = text;
        body.appendChild(line);
    }
    
    lastLogCount = logs.length;
    
    if (autoScroll) {
        body.scrollTop = body.scrollHeight;
    }
}

// Dynamically create filtering tags based on what categories are in the active scanned preview list
function updateFilterTags(items) {
    const filterWrap = document.getElementById('gallery-filter-tags');
    if (!filterWrap) return;
    
    filterWrap.innerHTML = `<button class="filter-btn ${activeFilter === 'all' ? 'active' : ''}" onclick="setFilter('all', this)">All Assets</button>`;
    
    const categories = [...new Set(items.map(i => i.category))].filter(Boolean).sort();
    
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${activeFilter === cat ? 'active' : ''}`;
        btn.onclick = function() { setFilter(cat, btn); };
        btn.innerText = cat;
        filterWrap.appendChild(btn);
    });
}

function toggleImagePreviews() {
    renderGalleryGrid();
}

function revealImage(el, filename, url, event) {
    event.stopPropagation();
    manuallyRevealed.add(filename);
    const img = document.createElement('img');
    img.src = url;
    img.alt = filename;
    img.loading = "lazy";
    el.parentNode.replaceChild(img, el);
}

function renderGalleryGrid() {
    const grid = document.getElementById('assets-grid');
    const emptyState = document.getElementById('empty-state');
    
    const searchInput = document.getElementById('search-input');
    const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
    
    const togglePreviews = document.getElementById('toggle-previews');
    const showPreviews = togglePreviews ? togglePreviews.checked : true;
    
    if (!grid) return;
    
    const cards = grid.querySelectorAll('.asset-card');
    cards.forEach(c => c.remove());

    if (scannedItems.length === 0) {
        if (emptyState) {
            emptyState.style.display = 'flex';
            emptyState.querySelector('h3').innerText = "Catalog Empty";
            emptyState.querySelector('p').innerText = "Click \"Scan Database\" above to preview and sort the transparent game assets.";
        }
        const controls = document.getElementById('pagination-controls');
        if (controls) controls.style.display = 'none';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    
    // Filter scanned items
    const filteredItems = scannedItems.filter(item => {
        const name = item.name.toLowerCase();
        const matchesFilter = (activeFilter === 'all' || item.category === activeFilter);
        const matchesSearch = (!searchVal || name.includes(searchVal));
        return matchesFilter && matchesSearch;
    });

    const visibleCount = filteredItems.length;
    const countLabel = document.getElementById('gallery-count');

    if (visibleCount === 0) {
        if (emptyState) {
            emptyState.style.display = 'flex';
            emptyState.querySelector('h3').innerText = "No search results match";
            emptyState.querySelector('p').innerText = "Try resetting your search query or filters.";
        }
        if (countLabel) countLabel.innerText = '0 items loaded';
        const controls = document.getElementById('pagination-controls');
        if (controls) controls.style.display = 'none';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Calculate pagination variables
    const totalPages = Math.ceil(visibleCount / pageSize);
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    if (currentPage < 1) {
        currentPage = 1;
    }

    // Slice items for current page
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, visibleCount);
    const pageItems = filteredItems.slice(startIndex, endIndex);

    // Update gallery count beautifully
    if (countLabel) {
        countLabel.innerText = `Showing ${startIndex + 1}-${endIndex} of ${visibleCount} items (${scannedItems.length} total)`;
    }

    // Render pagination controls
    renderPaginationControls(visibleCount);

    pageItems.forEach(item => {
        // Match against saved items list to determine status
        const savedMatch = savedItems.find(s => s.name === item.name);
        const isSaved = !!savedMatch;
        
        // Display details
        const imgUrl = isSaved ? savedMatch.url : item.url;
        const dimensions = isSaved ? savedMatch.dimensions : "512x512";
        const size = isSaved ? savedMatch.size : "AVAILABLE";
        
        const card = document.createElement('div');
        card.className = 'asset-card';
        card.onclick = function(e) {
            if (!e.target.closest('.asset-actions') && !e.target.closest('.preview-placeholder')) {
                openInspector(item.name);
            }
        };
        
        const formattedName = item.name.replace('.png', '').replace(/\./g, ' ');
        
        let statusBadge = `<span class="asset-status-badge available">AVAILABLE</span>`;
        if (isSaved) {
            statusBadge = `<span class="asset-status-badge saved"><i class="fa-solid fa-circle-check"></i> SAVED</span>`;
        }
        
        // Toggle preview display
        let displayContent = '';
        if (showPreviews || manuallyRevealed.has(item.name) || isSaved) {
            displayContent = `<img src="${imgUrl}" alt="${item.name}" loading="lazy">`;
        } else {
            displayContent = `
                <div class="preview-placeholder" onclick="revealImage(this, '${item.name}', '${imgUrl}', event)">
                    <i class="fa-regular fa-image"></i>
                    <span>Show Preview</span>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="asset-display" style="cursor: pointer;">
                <span class="asset-category-badge">${item.category}</span>
                ${statusBadge}
                ${displayContent}
            </div>
            <div class="asset-details">
                <div class="asset-title" title="${item.name}">${formattedName}</div>
                <div class="asset-specs">
                    <span>${dimensions}</span>
                    <span>${size}</span>
                </div>
                <div class="asset-actions">
                    <button class="btn-card" onclick="openInspector('${item.name}')" title="Inspect dynamic game metadata">
                        <i class="fa-solid fa-eye"></i> Preview
                    </button>
                    <button class="btn-card" onclick="copyName('${item.name}')" title="Copy exact item identifier">
                        <i class="fa-regular fa-copy"></i> Copy Name
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Action 1: Scan items folder for categories and load raw preview list
async function handleScanClick() {
    const sourceEl = document.getElementById('source-path');
    const source = sourceEl ? sourceEl.value.trim() : '';
    if (!source) {
        showToast("Error: Source path is required.");
        return;
    }

    const btnScan = document.getElementById('btn-scan');
    if (btnScan) {
        btnScan.disabled = true;
        btnScan.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Scanning...`;
    }

    try {
        const response = await fetch('/api/index', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_dir: source })
        });
        const data = await response.json();
        
        if (response.ok) {
            discoveredCategories = data.categories;
            scannedItems = data.items;
            
            // Render UI Checklist and Dynamic tags
            renderCategoryChecklist(data.categories);
            updateFilterTags(data.items);
            
            const catPanel = document.getElementById('category-panel');
            if (catPanel) catPanel.style.display = "block";
            
            // Reset pagination parameters
            currentPage = 1;

            // Load and preview all available items instantly!
            renderGalleryGrid();
            
            showToast(`Scanned ${data.items.length} items! Previewing catalog now.`);
            
            // Smoothly scroll down to the gallery preview header so the user sees it immediately!
            setTimeout(() => {
                const galleryHeader = document.querySelector('.gallery-header');
                if (galleryHeader) {
                    galleryHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 300);
        } else {
            showToast(`Scan Error: ${data.message}`);
        }
    } catch (err) {
        showToast("Connection to server failed during database scan.");
    } finally {
        if (btnScan) {
            btnScan.disabled = false;
            btnScan.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> <span>Scan Database</span>`;
        }
    }
}

// Render the Discovered Categories checklist dynamically (All Checked by Default!)
function renderCategoryChecklist(categories) {
    const grid = document.getElementById('checklist-grid');
    if (!grid) return;
    grid.innerHTML = "";

    const sortedKeys = Object.keys(categories).sort();

    sortedKeys.forEach(cat => {
        const count = categories[cat];
        const cleanCatName = cat.charAt(0).toUpperCase() + cat.slice(1);
        
        const item = document.createElement('label');
        item.className = "checklist-item";
        
        item.innerHTML = `
            <input type="checkbox" name="selected-category" value="${cat}" checked>
            <div class="checklist-item-lbl">
                <strong>${cleanCatName}</strong>
                <span>${count} items</span>
            </div>
        `;
        grid.appendChild(item);
    });
}

function toggleAllCheckboxes(checked) {
    const checkboxes = document.getElementsByName('selected-category');
    checkboxes.forEach(cb => cb.checked = checked);
}

function closeChecklistPanel() {
    const catPanel = document.getElementById('category-panel');
    if (catPanel) catPanel.style.display = "none";
}

// Action 2: Trigger Extract and Sort of Selected Categories
async function handleActionClick() {
    if (isRunning) {
        try {
            const response = await fetch('/api/cancel', { method: 'POST' });
            const result = await response.json();
            showToast(result.message);
        } catch (err) {
            showToast("Failed to stop indexing.");
        }
        return;
    }

    const srcInput = document.getElementById('source-path');
    const source = srcInput ? srcInput.value.trim() : '';
    
    const destInput = document.getElementById('dest-path');
    const dest = destInput ? destInput.value.trim() : '';
    
    // Get selected categories checked by the user
    const checkboxes = document.getElementsByName('selected-category');
    const selected = [];
    checkboxes.forEach(cb => {
        if (cb.checked) selected.push(cb.value);
    });

    if (selected.length === 0) {
        showToast("Error: Please select at least one category to extract!");
        return;
    }

    try {
        const response = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_dir: source, dest_dir: dest, categories: selected })
        });
        const result = await response.json();
        
        if (response.ok) {
            showToast("Category extraction started!");
            clearTerminal();
            closeChecklistPanel();
        } else {
            showToast(`Error: ${result.message}`);
        }
    } catch (err) {
        showToast("Connection to extraction server failed.");
    }
}

function clearTerminal() {
    const body = document.getElementById('log-body');
    if (body) {
        body.innerHTML = '<div class="log-line system">[system] Console log reset. Standing by...</div>';
    }
    lastLogCount = 0;
}

function setFilter(filter, el) {
    currentPage = 1;
    activeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    renderGalleryGrid();
}

function filterAssets() {
    currentPage = 1;
    renderGalleryGrid();
}

function copyName(name) {
    const cleaned = name.replace('.png', '');
    navigator.clipboard.writeText(cleaned).then(() => {
        showToast(`Copied string "${cleaned}" to clipboard.`);
    }).catch(() => {
        showToast("Clipboard copy failed.");
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast) return;
    if (toastMsg) toastMsg.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========================================================
// URL-Safe Base64 Encoder Helper for JS
// ========================================================
function encodePathB64(str) {
    if (!str) return '';
    try {
        return btoa(unescape(encodeURIComponent(str)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    } catch (e) {
        return '';
    }
}

// ========================================================
// Asset Inspector Modal JavaScript Logic
// ========================================================
async function openInspector(filename) {
    const modal = document.getElementById('inspector-modal');
    const titleEl = document.getElementById('modal-title');
    const shortnameEl = document.getElementById('modal-shortname');
    const categoryEl = document.getElementById('modal-category');
    const descriptionEl = document.getElementById('modal-description');
    const itemIdEl = document.getElementById('modal-item-id');
    const rarityEl = document.getElementById('modal-rarity');
    const stackEl = document.getElementById('modal-stack');
    const typeEl = document.getElementById('modal-type');
    const imgEl = document.getElementById('modal-image');
    const btnDownload = document.getElementById('btn-modal-download');
    
    if (!modal) return;
    
    activeInspectorItem = filename;
    
    // Initial UI state while fetching metadata
    if (titleEl) titleEl.innerText = filename.replace('.png', '').replace(/\./g, ' ');
    if (shortnameEl) shortnameEl.innerText = filename.replace('.png', '');
    if (categoryEl) categoryEl.innerText = "Loading...";
    if (descriptionEl) descriptionEl.innerText = "Fetching detailed game metadata companion file...";
    if (itemIdEl) itemIdEl.innerText = "...";
    if (rarityEl) rarityEl.innerText = "...";
    if (stackEl) stackEl.innerText = "...";
    if (typeEl) typeEl.innerText = "...";
    
    const itemMatch = scannedItems.find(i => i.name === filename);
    const fullPathSrc = itemMatch ? (itemMatch.full_path || '') : '';
    
    const savedMatch = savedItems.find(s => s.name === filename);
    const isSaved = !!savedMatch;
    const imgUrl = isSaved ? savedMatch.url : (itemMatch ? itemMatch.url : `/raw_assets/${filename}`);
    if (imgEl) imgEl.src = imgUrl;
    
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
    if (btnDownload) {
        if (isSaved) {
            btnDownload.innerHTML = `<i class="fa-solid fa-circle-check"></i> Already Saved`;
            btnDownload.className = "btn btn-outline";
            btnDownload.disabled = true;
        } else {
            btnDownload.innerHTML = `<i class="fa-solid fa-download"></i> Save to Folder`;
            btnDownload.className = "btn btn-primary";
            btnDownload.disabled = false;
        }
    }
    
    try {
        const b64_path = encodePathB64(fullPathSrc);
        const response = await fetch(`/api/metadata/${encodeURIComponent(filename)}?full_path_b64=${b64_path}`);
        if (!response.ok) throw new Error("Metadata not found");
        const data = await response.json();
        
        if (data.status === "success" && data.metadata) {
            const meta = data.metadata;
            if (titleEl) titleEl.innerText = meta.Name || meta.shortname || (shortnameEl ? shortnameEl.innerText : '');
            if (shortnameEl) shortnameEl.innerText = meta.shortname || shortnameEl.innerText;
            if (categoryEl) categoryEl.innerText = meta.Category || "Misc";
            if (descriptionEl) descriptionEl.innerText = meta.Description || "No description provided for this item in game files.";
            if (itemIdEl) itemIdEl.innerText = meta.itemid || "N/A";
            if (rarityEl) rarityEl.innerText = meta.rarity || "Common";
            if (stackEl) stackEl.innerText = meta.stackable || "1";
            if (typeEl) typeEl.innerText = meta.ItemType || "Generic";
        }
    } catch (err) {
        console.error("Error fetching metadata:", err);
        if (descriptionEl) descriptionEl.innerText = "Detailed companion metadata could not be retrieved. Item can still be saved directly.";
        if (categoryEl) categoryEl.innerText = "Unknown";
        if (itemIdEl) itemIdEl.innerText = "N/A";
        if (rarityEl) rarityEl.innerText = "Unknown";
        if (stackEl) stackEl.innerText = "N/A";
        if (typeEl) typeEl.innerText = "N/A";
    }
}

function closeInspectorModal(event, force = false) {
    const modal = document.getElementById('inspector-modal');
    if (!modal) return;
    if (force || event.target === modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

function copyModalName() {
    if (!activeInspectorItem) return;
    copyName(activeInspectorItem);
}

async function downloadModalAsset() {
    if (!activeInspectorItem) return;
    const destEl = document.getElementById('dest-path');
    const dest = destEl ? destEl.value.trim() : '';
    const sourceEl = document.getElementById('source-path');
    const source = sourceEl ? sourceEl.value.trim() : '';
    const btnDownload = document.getElementById('btn-modal-download');
    
    const itemMatch = scannedItems.find(i => i.name === activeInspectorItem);
    const fullPathSrc = itemMatch ? (itemMatch.full_path || '') : '';
    
    if (btnDownload) {
        btnDownload.disabled = true;
        btnDownload.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...`;
    }
    
    try {
        const response = await fetch('/api/extract_single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                filename: activeInspectorItem, 
                full_path: fullPathSrc, 
                dest_dir: dest,
                source_dir: source
            })
        });
        
        const result = await response.json();
        if (response.ok) {
            showToast(`Saved successfully!`);
            if (btnDownload) {
                btnDownload.innerHTML = `<i class="fa-solid fa-circle-check"></i> Saved Successfully`;
                btnDownload.className = "btn btn-outline";
            }
            
            // Poll server to update state and trigger grid refresh
            pollServerStatus();
        } else {
            showToast(`Error: ${result.message}`);
            if (btnDownload) {
                btnDownload.disabled = false;
                btnDownload.innerHTML = `<i class="fa-solid fa-download"></i> Save to Folder`;
            }
        }
    } catch (err) {
        showToast("Connection failed while saving item.");
        if (btnDownload) {
            btnDownload.disabled = false;
            btnDownload.innerHTML = `<i class="fa-solid fa-download"></i> Save to Folder`;
        }
    }
}

async function handleBrowseClick() {
    const btn = document.getElementById('btn-browse');
    if (!btn) return;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Browsing...`;
    
    try {
        const response = await fetch('/api/browse_folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        
        if (data.status === "success" && data.path) {
            const destInput = document.getElementById('dest-path');
            if (destInput) destInput.value = data.path;
            showToast(`Selected destination: ${data.path}`);
        } else if (data.status === "cancelled") {
            showToast("Folder selection cancelled.");
        } else {
            showToast(`Browse Error: ${data.message}`);
        }
    } catch (err) {
        showToast("Failed to launch native folder browser.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

// Handle Escape key to close inspector or lightbox
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeZoomLightbox();
        closeInspectorModal(null, true);
    }
});

// ========================================================
// Image Zoom Lightbox
// ========================================================
function openZoomLightbox(src) {
    if (!src) return;
    const lb = document.getElementById('zoom-lightbox');
    const img = document.getElementById('zoom-lightbox-img');
    if (!lb || !img) return;
    img.src = src;
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeZoomLightbox() {
    const lb = document.getElementById('zoom-lightbox');
    if (lb) lb.style.display = 'none';
    document.body.style.overflow = '';
}

// ========================================================
// Self-Healing Anti-Deletion Credits Guard
// DOM listener to ensure Welsonnot's top credits & version
// can't be deleted or hidden by sneaky inspect elements!
// ========================================================
function initFooterGuard() {
    const footerHTML = `
        <span class="footer-text">Unity Asset Fetcher <span class="footer-ver">v2.0.0</span></span>
        <span class="footer-divider">•</span>
        <span class="footer-dev">Developed by <a href="https://github.com/Welsonnot" target="_blank" rel="noopener noreferrer" id="footer-author-link">Welsonnot</a></span>
    `;

    function verifyFooter() {
        let footer = document.getElementById('app-footer');
        const parent = document.querySelector('header');
        
        if (!parent) return;

        // If the credits banner is completely deleted, spawn it back in at the top!
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'app-credits-top';
            footer.id = 'app-footer';
            footer.innerHTML = footerHTML;
            parent.appendChild(footer);
        } else {
            // Check if someone tried to hide it via styling
            const style = window.getComputedStyle(footer);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1 || footer.offsetHeight === 0) {
                footer.style.setProperty('display', 'flex', 'important');
                footer.style.setProperty('visibility', 'visible', 'important');
                footer.style.setProperty('opacity', '1', 'important');
            }

            // Make sure the link, developer name, and href are not altered
            const link = document.getElementById('footer-author-link');
            if (!link || link.getAttribute('href') !== 'https://github.com/Welsonnot' || link.innerText.trim() !== 'Welsonnot') {
                footer.innerHTML = footerHTML;
            }
        }
    }

    // Set up a MutationObserver to watch DOM modifications
    const observer = new MutationObserver((mutations) => {
        verifyFooter();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'id', 'href']
    });

    // Run a fallback interval scan every 1 second in case observer is bypassed
    setInterval(verifyFooter, 1000);
    
    // Initial verification
    verifyFooter();
}

// Start the footer integrity guard on boot!
initFooterGuard();

// ========================================================
// Theme Toggle & Mode Control (System Sync + Persistent)
// ========================================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.body.classList.add('dark-mode');
        updateToggleIcon(true);
    } else {
        document.body.classList.remove('dark-mode');
        updateToggleIcon(false);
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateToggleIcon(isDark);
}

function updateToggleIcon(isDark) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

// Initial theme setup
initTheme();
