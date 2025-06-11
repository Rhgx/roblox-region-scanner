document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const appTitleLink = document.getElementById('appTitleLink');
    const appHeader = document.querySelector('.app-header');
    const initialView = document.getElementById('initialView');
    const placeIdInput = document.getElementById('placeIdInput');
    const findServersBtn = document.getElementById('findServersBtn');
    const initialStatusMessage = document.getElementById('initialStatusMessage');

    const toggleAdvancedSettings = document.getElementById('toggleAdvancedSettings');
    const advancedSettingsPanel = document.getElementById('advancedSettingsPanel');
    const serversToScanInput = document.getElementById('serversToScanInput');
    const serversToScanValue = document.getElementById('serversToScanValue');
    const batchSizeInput = document.getElementById('batchSizeInput');
    const delayBetweenGeolocationBatchesInput = document.getElementById('delayBetweenGeolocationBatchesInput');
    const mainView = document.getElementById('mainView');

    // Game Preview Elements
    const gamePreviewPanel = document.getElementById('gamePreviewPanel');
    const gamePreviewThumbnail = document.getElementById('gamePreviewThumbnail');
    const gamePreviewName = document.getElementById('gamePreviewName');
    const gamePreviewPlaying = document.getElementById('gamePreviewPlaying');
    const gamePreviewVisits = document.getElementById('gamePreviewVisits');
    const globeElement = document.getElementById('globeViz');

    const gameInfoThumbnail = document.getElementById('gameInfoThumbnail');
    const gameInfoName = document.getElementById('gameInfoName');
    const gameInfoPlaying = document.getElementById('gameInfoPlaying');
    const gameInfoVisits = document.getElementById('gameInfoVisits');

    const gameInfoPanel = document.getElementById('gameInfoPanel');
    const serverListTitle = document.getElementById('serverListTitle');
    const serverListContent = document.getElementById('serverListContent');
    const serverListPlaceholderClass = 'list-placeholder';
    const loaderOverlay = document.getElementById('loaderOverlay');
    const loaderMessage = document.getElementById('loaderMessage');

    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');

    // Filter & Tab Elements
    const sidebarTabs = document.querySelector('.sidebar-tabs');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const regionFilter = document.getElementById('regionFilter');
    const maxPingFilter = document.getElementById('maxPingFilter');
    const maxPingValue = document.getElementById('maxPingValue');
    const filterStatusMessage = document.getElementById('filterStatusMessage');
    
    // Sort Elements
    const sortBySelect = document.getElementById('sortBySelect');
    const sortOrderBtn = document.getElementById('sortOrderBtn');
    const sortOrderIcon = document.getElementById('sortOrderIcon');


    // --- State & Config ---
    const API_BASE_URL = '';
    let globe;
    let globeInitialized = false;
    let currentPlaceIdForJoin = null;
    let previewDebounceTimer;
    let currentPreviewPlaceId = null;
    let previewRequestController = null; // To abort stale fetch requests
    let allServers = []; // Store the full, unfiltered list of servers
    let currentGameDetails = null; // Store preview data for use in the main view

    // Auto-rotation state
    let autoRotateTimeout;
    let isGlobeFocused = false;
    let isAutoRotating = false;
    let animationFrameId;

    let advancedSettings = {
        serversToScan: 100, // Total servers to attempt to scan
        batchSize: 5,
        delayBetweenGeolocationBatches: 500,
        isPanelOpen: false // For UI state
    };
    
    // Target state set by user controls
    let currentFilters = {
        region: 'all',
        maxPing: 500,
    };
    
    // Animated state used for rendering to create smooth transitions
    let animatedFilters = {
        maxPing: 500,
    };

    let currentSort = {
        by: 'ping', // 'ping' or 'playing'
        order: 'asc' // 'asc' or 'desc'
    };

    // --- Initial Setup (GSAP Animations for Page Load) ---
    // Establish initial hidden states for elements that will animate in
    gsap.set(appHeader, { y: -50, autoAlpha: 0 }); // Header starts slightly off-screen top
    gsap.set(initialView, { y: 30, autoAlpha: 0 }); // Initial view starts slightly off-screen bottom, invisible
    gsap.set(mainView, { display: 'none', autoAlpha: 0 }); // Ensure mainView is truly hidden and doesn't take space
    gsap.set(gamePreviewPanel, { autoAlpha: 0, y: 20 }); // Set initial state for preview panel

    // Run initial setup functions (these don't conflict with initial visual state)
    loadAdvancedSettings();
    setupEventListeners();

    // GSAP Intro Animation Timeline
    const tlIntro = gsap.timeline({ defaults: { ease: 'power2.out' } });

    tlIntro.to(appHeader, { y: 0, autoAlpha: 1, duration: 0.6 }) // Animate header into place
           .to(initialView, { y: 0, autoAlpha: 1, duration: 0.8 }, "<0.2"); // Animate initialView into place, starting shortly after header


    // --- UI State Management & Transitions (existing functions) ---
    function setUIState(stateName, serverData = null) {
        const tl = gsap.timeline();

        if (stateName === 'globe') {
            tl.to(initialView, { 
                autoAlpha: 0, 
                y: -30, 
                scale: 0.95, 
                duration: 0.4, 
                ease: 'power2.in', 
                onComplete: () => {
                    initialView.style.display = 'none'; // Hide completely after animation
                }
            })
            .set(mainView, { // Set initial state for mainView before animating it in
                display: 'flex', // Make it flex so it takes up space when autoAlpha becomes 1
                autoAlpha: 0,
                y: 30,
                scale: 0.95
            })
            .to(mainView, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.5,
                ease: 'power2.out',
                onComplete: () => {
                    if (!globeInitialized) { initGlobe(); }
                    if (globeInitialized && globe) {
                        globe.width(globeElement.parentElement.offsetWidth);
                        globe.height(globeElement.parentElement.offsetHeight);
                    }
                    if (serverData && serverData.servers) {
                        allServers = serverData.servers;
                        populateRegionFilter(allServers);
                        // Set initial animated value without animation
                        animatedFilters.maxPing = currentFilters.maxPing;
                        applyFiltersAndRender();
                    } else {
                        allServers = [];
                        addServersToGlobe([]);
                        populateServerList([]);
                    }
                    isGlobeFocused = false; // Ensure focus is reset when entering this view
                    resetAutoRotateTimer(); // Start the timer when the view becomes active
                    switchTab('filters');
                }
            });
        } else { // 'search' state
            tl.to(mainView, { 
                autoAlpha: 0, 
                y: 30, 
                duration: 0.4, 
                ease: 'power2.in', 
                onComplete: () => {
                    mainView.style.display = 'none'; // Hide completely after animation
                }
            })
            .set(initialView, { // Set initial state for initialView before animating it in
                display: 'flex', // Make it flex so it takes up space when autoAlpha becomes 1
                autoAlpha: 0,
                y: -30,
                scale: 0.95
            })
            .to(initialView, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.5,
                ease: 'power2.out',
                onComplete: () => {
                    stopAutoRotation(); // Make sure it stops when we leave the globe view
                    updateInitialStatus('Enter a Place ID to begin.');
                    hideGamePreview(); // Hide preview when returning to search
                    clearServerListAndGameInfo();
                    currentGameDetails = null; // Clear the stored details when returning to search
                }
            });
        }
    }

    function updateProgressBar(progress, message = 'Loading...') {
        // Clamp progress between 0 and 1
        progress = Math.max(0, Math.min(1, progress));
        const percentage = Math.round(progress * 100);
        
        gsap.to(progressBar, { width: `${percentage}%`, duration: 0.2, ease: 'power1.out' });
        progressText.textContent = `${percentage}%`;
        loaderMessage.textContent = message;
        
        if (percentage > 0 && percentage < 100) {
            gsap.to(progressText, { color: 'var(--text-highlight)', duration: 0.2 });
            gsap.to(progressBar, { backgroundColor: 'var(--accent-primary)', duration: 0.2 });
        } else if (percentage === 100) {
            gsap.to(progressText, { color: 'var(--accent-success)', duration: 0.2 });
            gsap.to(progressBar, { backgroundColor: 'var(--accent-success)', duration: 0.2 });
        } else {
            gsap.to(progressText, { color: 'var(--text-highlight)', duration: 0.2 });
            gsap.to(progressBar, { backgroundColor: 'var(--accent-primary)', duration: 0.2 });
        }
    }

    function resetProgressBar() {
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        progressText.style.color = 'var(--text-highlight)';
        progressBar.style.backgroundColor = 'var(--accent-primary)';
    }

    function showLoader(message = 'Loading...') {
        gsap.to(loaderOverlay, { autoAlpha: 1, duration: 0.25, ease: 'power1.out' });
        gsap.to(progressBar.parentElement, { autoAlpha: 1, duration: 0.25, ease: 'power1.out' });
    }

    function hideLoader() {
        gsap.to(loaderOverlay, { autoAlpha: 0, duration: 0.3, ease: 'power1.in' });
        gsap.to(progressBar.parentElement, { autoAlpha: 0, duration: 0.3, ease: 'power1.in' });
    }

    function updateInitialStatus(message, type = 'default') {
        initialStatusMessage.textContent = message;
        initialStatusMessage.className = 'status-message';
        if (type !== 'default') initialStatusMessage.classList.add(type);
    }
    
    function switchTab(tabName) {
        sidebarTabs.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.dataset.tabContent === tabName);
        });
    }

    function populateGameInfo(details) {
        // This function now populates the structured game info panel
        if (details && details.name) {
            gameInfoName.textContent = details.name ?? 'N/A';
            gameInfoPlaying.textContent = details.playing?.toLocaleString() ?? 'N/A';
            gameInfoVisits.textContent = details.visits?.toLocaleString() ?? 'N/A'; // Assuming 'visits' is available

            // Handle thumbnail with a loaded effect like the preview
            gameInfoThumbnail.className = ''; // Reset class
            gameInfoThumbnail.src = ''; // Clear old image

            if (details.thumbnailUrl) {
                const img = new Image();
                img.onload = () => {
                    gameInfoThumbnail.src = img.src;
                    gameInfoThumbnail.classList.add('loaded');
                };
                img.onerror = () => {
                    gameInfoThumbnail.classList.add('loaded'); // remove blur even on error
                };
                img.src = details.thumbnailUrl;
            } else {
                gameInfoThumbnail.classList.add('loaded'); // No image to load, remove blur
            }
        } else {
            gameInfoName.textContent = 'Game Details Not Available';
            gameInfoPlaying.textContent = 'N/A';
            gameInfoVisits.textContent = 'N/A';
        }
    }

    function populateServerList(servers, context = 'all') {
        serverListContent.innerHTML = '';

        if (!servers || servers.length === 0) {
            let message = 'No servers match the current filters.';
            if (context === 'locationClick') {
                message = `No servers found in this specific location.`;
            }
            serverListContent.innerHTML = `<p class="${serverListPlaceholderClass}">${message}</p>`;
            serverListTitle.textContent = "Server List";
            return;
        }

        let titleText = `Filtered Servers (${servers.length})`;
        if (context === 'locationClick') {
             titleText = servers.length > 1 ? `Servers in ${servers[0].city}, ${servers[0].country} (${servers.length})` : `Server: ${servers[0].city || 'Unknown Location'}, ${servers[0].country || 'Null City'}`;
        }
        serverListTitle.textContent = titleText;

        servers.forEach((server, index) => {
            const isFull = server.playing === server.maxPlayers;
            const playerCountStr = (typeof server.playing === 'number' && typeof server.maxPlayers === 'number')
                ? `${server.playing}/${server.maxPlayers}`
                : 'N/A';
            
            const locationString = [server.city, server.regionName, server.countryCode]
                .filter(Boolean) // Remove any null/undefined/empty parts
                .join(', ');

            const itemDiv = document.createElement('div');
            itemDiv.className = 'server-item';
            itemDiv.innerHTML = `
                <div class="server-item-details">
                    ${context === 'locationClick' && servers.length > 1 ? `<strong class="highlight">Server ${index + 1}</strong><br>` : ''}
                    <span class="detail-label">Location:</span> <span>${locationString || 'N/A'}</span><br>
                    <span class="detail-label">Players:</span> <span>${playerCountStr}</span><br>
                    <span class="detail-label">Ping:</span> <span>${server.ping || 'N/A'}ms</span><br>
                    <span class="detail-label">Server ID:</span> <span>${server.id || 'N/A'}</span>
                </div>
                <button class="join-button-list" data-placeid="${currentPlaceIdForJoin}" data-serverid="${server.id}" ${isFull ? 'disabled' : ''}>${isFull ? 'Full' : 'Join'}</button>
            `;
            serverListContent.appendChild(itemDiv);
        });

        // Animate the newly added server items
        const serverItems = serverListContent.querySelectorAll('.server-item');
        if (serverItems.length > 0) {
            gsap.from(serverItems, {
                duration: 0.4,
                opacity: 0,
                y: 15,
                stagger: 0.05,
                ease: 'power2.out'
            });
        }
    }
    
    function clearServerListAndGameInfo() {
        serverListContent.innerHTML = `<p class="${serverListPlaceholderClass}">Click a server on the globe.</p>`;
        serverListTitle.textContent = "Server Details";
        // Reset game info panel instead of clearing its HTML
        gameInfoName.textContent = 'Game Name';
        gameInfoPlaying.textContent = 'N/A';
        gameInfoVisits.textContent = 'N/A';
        gameInfoThumbnail.src = '';
        gameInfoThumbnail.className = '';
        allServers = [];
    }
    
    // --- Globe Auto-Rotation Logic ---
    function stopAutoRotation() {
        clearTimeout(autoRotateTimeout);
        if (isAutoRotating) {
            cancelAnimationFrame(animationFrameId);
            isAutoRotating = false;
        }
    }

    function startAutoRotation() {
        if (isAutoRotating || isGlobeFocused) return; // Don't start if already rotating or focused on a point
        isAutoRotating = true;

        const rotate = () => {
            const currentPov = globe.pointOfView();
            const newPov = { ...currentPov, lng: (currentPov.lng || 0) + 0.05 }; 
            globe.pointOfView(newPov, 0); // 0ms transition for smooth frame-by-frame update
            animationFrameId = requestAnimationFrame(rotate);
        };
        rotate();
    }

    function resetAutoRotateTimer() {
        stopAutoRotation();
        if (!isGlobeFocused) {
            autoRotateTimeout = setTimeout(startAutoRotation, 5000); // 5 seconds inactivity timeout
        }
    }

    function handleGlobeInteraction() {
        stopAutoRotation();
        resetAutoRotateTimer();
    }

    function initGlobe() {
        if (!globeElement) return;

        globe = Globe()(globeElement)
            .globeImageUrl('assets/equirectangular-projection-test.png')
            .bumpImageUrl('')
            .backgroundImageUrl('/assets/background.png')
            .backgroundColor('rgba(13, 17, 23, 1)')
            .showAtmosphere(true)
            .atmosphereColor('#58a6ff')
            .atmosphereAltitude(0.25)
            .pointsData([])
            .pointLat('lat').pointLng('lon').pointColor(() => 'rgba(0,0,0,0)')
            .pointAltitude(0.01).pointRadius(1.2)
            .pointLabel(p => `<b>${p.servers[0].city}, ${p.servers[0].country}</b> (${p.servers.length} server${p.servers.length > 1 ? 's' : ''})`)
            .onPointClick(location => {
                isGlobeFocused = true;
                stopAutoRotation(); // Stop rotation when a point is clicked
                const sortedLocationServers = sortServers(location.servers);
                populateServerList(sortedLocationServers, 'locationClick');
                switchTab('servers');
                globe.pointOfView({ lat: location.lat, lng: location.lon, altitude: 1.5 }, 700);
            })
            .htmlElementsData([])
            .htmlLat('lat').htmlLng('lon')
            .htmlElement(() => {
                const el = document.createElement('div');
                el.innerHTML = `<div class="globe-ping"><div class="dot"></div><div class="pulse"></div></div>`;
                return el;
            })
            .onGlobeClick(() => {
                isGlobeFocused = false; // Un-focus when clicking the globe background
                resetAutoRotateTimer(); // Restart the inactivity timer
                applyFiltersAndRender(); // Re-apply filters to show all matching servers
            });

        // Add listeners for drag/zoom to reset the auto-rotate timer
        const globeCanvas = globeElement.querySelector('canvas');
        if (globeCanvas) {
            globeCanvas.addEventListener('mousedown', handleGlobeInteraction);
            globeCanvas.addEventListener('touchstart', handleGlobeInteraction, { passive: true });
            globeCanvas.addEventListener('wheel', handleGlobeInteraction, { passive: true });
        }

        window.addEventListener('resize', () => {
             if (globeElement.parentElement.offsetWidth > 0) {
                 globe.width(globeElement.parentElement.offsetWidth);
                 globe.height(globeElement.parentElement.offsetHeight);
             }
        });
        globe.width(globeElement.parentElement.offsetWidth);
        globe.height(globeElement.parentElement.offsetHeight);
        globeInitialized = true;
        resetAutoRotateTimer(); // Start the timer for the first time
    }

    function addServersToGlobe(servers) {
        if (!globeInitialized) return;
        
        const locations = new Map();
        servers.forEach(server => {
            const key = `${server.lat},${server.lon}`;
            if (!locations.has(key)) {
                locations.set(key, {
                    lat: server.lat,
                    lon: server.lon,
                    servers: []
                });
            }
            locations.get(key).servers.push(server);
        });

        const compiledData = Array.from(locations.values());
        globe.pointsData(compiledData);
        globe.htmlElementsData(compiledData);

        if (compiledData.length === 0 && allServers.length > 0) {
            // No servers match filter, but we have servers, so don't move camera
        } else if (compiledData.length > 0) {
            // globe.pointOfView({ lat: 41.05, lng: 29.04, altitude: 2.2 }, 1500); // Optional: focus on first result
        } else {
             globe.pointOfView({ lat: 27, lng: 0, altitude: 0 }, 1500);
        }
    }
    
    // --- Sorting & Filtering Logic ---
    function sortServers(servers) {
        const { by, order } = currentSort;
        const sorted = [...servers]; // Create a shallow copy to avoid mutating the original

        sorted.sort((a, b) => {
            let comparisonA = a[by];
            let comparisonB = b[by];

            if (comparisonA === undefined || comparisonA === null) return 1;
            if (comparisonB === undefined || comparisonB === null) return -1;
            
            // For players, we want to sort high-to-low by default
            const modifier = (by === 'playing' ? -1 : 1);

            if (comparisonA < comparisonB) {
                return order === 'asc' ? -1 * modifier : 1 * modifier;
            }
            if (comparisonA > comparisonB) {
                return order === 'asc' ? 1 * modifier : -1 * modifier;
            }
            return 0;
        });
        
        return sorted;
    }

    function populateRegionFilter(servers) {
        const regions = [...new Set(servers.map(s => s.regionName).filter(Boolean))];
        regions.sort();
        regionFilter.innerHTML = '<option value="all">All Regions</option>'; // Reset
        regions.forEach(region => {
            const option = document.createElement('option');
            option.value = region;
            option.textContent = region;
            regionFilter.appendChild(option);
        });
    }

    function applyFiltersAndRender() {
        let filteredServers = [...allServers];

        // 1. Filter by Region
        if (currentFilters.region !== 'all') {
            filteredServers = filteredServers.filter(s => s.regionName === currentFilters.region);
        }
        // 2. Filter by Ping - USE THE ANIMATED VALUE
        filteredServers = filteredServers.filter(s => (s.ping || 0) <= animatedFilters.maxPing);
        
        // 3. Sort the filtered results
        const sortedServers = sortServers(filteredServers);

        filterStatusMessage.textContent = `Showing ${filteredServers.length} of ${allServers.length} servers.`;

        populateServerList(sortedServers, 'all');
        addServersToGlobe(filteredServers); // Globe data doesn't need to be sorted
    }
    
    // --- Game Preview Logic ---
    function hideGamePreview() {
        // Return a promise that resolves when the animation completes
        return new Promise(resolve => {
            // If it's already hidden, resolve immediately.
            if (gsap.getProperty(gamePreviewPanel, "autoAlpha") === 0) {
                resolve();
                return;
            }
            
            gsap.to(gamePreviewPanel, {
                autoAlpha: 0,
                y: 20,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: resolve
            });
        });
    }

    function showGamePreview(data) {
        // 1. Populate text data
        gamePreviewName.textContent = data.name;
        gamePreviewPlaying.textContent = data.playing?.toLocaleString() ?? 'N/A';
        gamePreviewVisits.textContent = data.visits?.toLocaleString() ?? 'N/A';
    
        // 2. Preload image to prevent flicker/showing old image
        gamePreviewThumbnail.className = ''; // Reset class to keep it blurred
        gamePreviewThumbnail.src = ''; // Clear previous image immediately
    
        if (data.thumbnailUrl) {
            const img = new Image();
            img.onload = () => {
                // Only update if the panel is still meant for this game
                if (currentPreviewPlaceId === data.placeId) {
                    gamePreviewThumbnail.src = img.src;
                    gamePreviewThumbnail.classList.add('loaded');
                }
            };
            img.onerror = () => {
                if (currentPreviewPlaceId === data.placeId) {
                    gamePreviewThumbnail.classList.add('loaded'); // remove blur even on error
                }
            };
            img.src = data.thumbnailUrl;
        } else {
            gamePreviewThumbnail.classList.add('loaded'); // No image to load, remove blur
        }
    
        // 3. Animate panel into view
        gsap.to(gamePreviewPanel, {
            autoAlpha: 1,
            y: 0,
            duration: 0.4,
            ease: 'power2.out'
        });
    }
    
    async function fetchGamePreview(placeId) {
        // Abort any previous, ongoing fetch request.
        if (previewRequestController) {
            previewRequestController.abort();
        }
        previewRequestController = new AbortController();
        const signal = previewRequestController.signal;
    
        const isVisible = gsap.getProperty(gamePreviewPanel, "autoAlpha") > 0;
        
        // If a preview is visible, hide it first.
        if (isVisible) {
            await hideGamePreview();
        }
    
        try {
            const res = await fetch(`${API_BASE_URL}/api/game-preview/${placeId}`, { signal });
            if (!res.ok) throw new Error('Game not found');
    
            const data = await res.json();
            
            // Final check: Only show if the input value still matches the one we fetched for.
            if (placeIdInput.value.trim() === placeId) {
                currentPreviewPlaceId = placeId;
                data.placeId = placeId; // Add placeId to the data object for the image preload check
                showGamePreview(data);
                currentGameDetails = data; // <<< --- CHANGED: Store the fetched details
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.log(`Preview fetch failed for ${placeId}:`, err.message);
                // If the fetch failed (e.g., 404), ensure the current ID is cleared.
                currentPreviewPlaceId = null;
                currentGameDetails = null; // <<< --- CHANGED: Clear details on error too
            }
        }
    }

    function setupEventListeners() {
        // Filter Listeners
        regionFilter.addEventListener('change', (e) => {
            currentFilters.region = e.target.value;
            applyFiltersAndRender(); // Region changes are instant but will trigger the list animation
        });
        
        // Ping slider: 'input' for live text update, 'change' for triggering animation
        maxPingFilter.addEventListener('input', (e) => {
            // Update the text label immediately for user feedback
            maxPingValue.textContent = e.target.value;
        });

        maxPingFilter.addEventListener('change', (e) => {
            const targetPing = parseInt(e.target.value, 10);
            currentFilters.maxPing = targetPing;
            
            // Kill any existing animation on this object to prevent conflicts
            gsap.killTweensOf(animatedFilters);

            // Animate the 'animatedFilters.maxPing' value to the target
            gsap.to(animatedFilters, {
                maxPing: targetPing,
                duration: 0.5, // Animation duration in seconds
                ease: 'power2.out', // A nice easing function
                onUpdate: applyFiltersAndRender // Call render on every frame of the animation
            });
        });

        // Sort Listeners
        sortBySelect.addEventListener('change', (e) => {
            currentSort.by = e.target.value;
            applyFiltersAndRender(); // Will trigger the list animation
        });

        sortOrderBtn.addEventListener('click', () => {
            // 1. Toggle the state
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';

            // 2. Animate the icon using a vertical flip
            gsap.to(sortOrderIcon, {
                rotationX: '+=180', // Adds 180 degrees to the current rotation
                duration: 0.4,
                ease: 'power3.inOut'
            });

            // 3. Update the tooltip for accessibility
            sortOrderBtn.title = currentSort.order === 'asc' ? 'Sort Ascending' : 'Sort Descending';

            // 4. Re-render the list with the new sort order
            applyFiltersAndRender();
        });

        // Advanced Settings Panel Logic
        gsap.set(advancedSettingsPanel, { height: 0, autoAlpha: 0, overflow: 'hidden' });

        toggleAdvancedSettings.addEventListener('click', () => {
            advancedSettings.isPanelOpen = !advancedSettings.isPanelOpen;
            if (advancedSettings.isPanelOpen) {
                gsap.to(advancedSettingsPanel, {
                    height: 'auto',
                    autoAlpha: 1,
                    duration: 0.3,
                    ease: 'power2.out',
                    onComplete: () => advancedSettingsPanel.style.overflow = 'visible'
                });
            } else {
                advancedSettingsPanel.style.overflow = 'hidden';
                gsap.to(advancedSettingsPanel, {
                    height: 0,
                    autoAlpha: 0,
                    duration: 0.3,
                    ease: 'power2.in'
                });
            }
        });

        // Search and Input Listeners
        findServersBtn.addEventListener('click', handleSearch);
        placeIdInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') handleSearch(); });
        
        placeIdInput.addEventListener('input', () => {
            clearTimeout(previewDebounceTimer);
            const placeId = placeIdInput.value.trim();
        
            // If the input is cleared or invalid, hide the panel if it's visible.
            if (!placeId || isNaN(placeId) || placeId.length < 6) {
                currentPreviewPlaceId = null; // Clear the ID
                currentGameDetails = null; // <<< --- CHANGED: Clear details if input is invalid
                if (previewRequestController) {
                    previewRequestController.abort(); // Abort any pending requests
                }
                hideGamePreview();
                return;
            }
        
            // Do nothing if the ID hasn't changed.
            if (placeId === currentPreviewPlaceId) return;
        
            // Debounce the fetch call.
            previewDebounceTimer = setTimeout(() => {
                fetchGamePreview(placeId);
            }, 400);
        });

        appTitleLink.addEventListener('click', () => {
            if (mainView.style.opacity > 0) {
                setUIState('search');
                placeIdInput.value = '';
            }
            hideLoader(); // Hide loader when returning to search
        });

        sidebarTabs.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.sidebar-tab');
            if (tabButton) {
                switchTab(tabButton.dataset.tab);
            }
        });

        document.addEventListener('click', function(event) {
            const targetButton = event.target.closest('.join-button-list');
            if (targetButton) {
                event.preventDefault();
                const placeId = targetButton.dataset.placeid;
                const serverId = targetButton.dataset.serverid;
                if (placeId && serverId) {
                    const joinUrl = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${serverId}`;
                    console.log(`Attempting to join: ${joinUrl}`);
                    window.location.href = joinUrl;
                }
            }
        });
    }

    function loadAdvancedSettings() {
        const storedSettings = localStorage.getItem('advancedSettings');
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            // Ensure values are within bounds and are numbers
            advancedSettings.serversToScan = Math.max(100, Math.min(300, parseInt(parsedSettings.serversToScan) || 100)); // Max 300
            advancedSettings.batchSize = Math.max(1, Math.min(20, parseInt(parsedSettings.batchSize) || 5)); 
            advancedSettings.delayBetweenGeolocationBatches = Math.max(0, Math.min(5000, parseInt(parsedSettings.delayBetweenGeolocationBatches) || 500));
        }
        serversToScanInput.value = advancedSettings.serversToScan;
        serversToScanValue.textContent = advancedSettings.serversToScan; // Update slider value display
        batchSizeInput.value = advancedSettings.batchSize; // Set batch size input value
        delayBetweenGeolocationBatchesInput.value = advancedSettings.delayBetweenGeolocationBatches;

        // Update settings object when inputs change
        serversToScanInput.addEventListener('input', (e) => {
            advancedSettings.serversToScan = parseInt(e.target.value, 10);
            serversToScanValue.textContent = advancedSettings.serversToScan; // Update slider value display
            saveAdvancedSettings();
        });
        batchSizeInput.addEventListener('input', (e) => { // Batch size listener
            advancedSettings.batchSize = parseInt(e.target.value, 10);
            saveAdvancedSettings();
        });
        delayBetweenGeolocationBatchesInput.addEventListener('input', (e) => {
            advancedSettings.delayBetweenGeolocationBatches = parseInt(e.target.value, 10);
            saveAdvancedSettings();
        });
    }

    function saveAdvancedSettings() {
        localStorage.setItem('advancedSettings', JSON.stringify(advancedSettings));
    }

    // --- Main Search Function ---
    async function handleSearch() {
        const placeId = placeIdInput.value.trim();
        if (!placeId || isNaN(placeId)) {
            updateInitialStatus('Please enter a valid Place ID.', 'error');
            gsap.fromTo(placeIdInput, { x: -6 }, { x: 6, duration: 0.05, repeat: 5, yoyo: true, clearProps: "x", ease: "power2.inOut" });
            return;
        }

        currentPlaceIdForJoin = placeId;
        findServersBtn.disabled = true;
        showLoader('Preparing scan...');
        updateInitialStatus('Searching for servers...', 'loading');
        resetProgressBar();

        // Build query parameters from advanced settings
        const queryParams = new URLSearchParams({
            serversToScan: advancedSettings.serversToScan,
            batchSize: advancedSettings.batchSize,
            delayBetweenGeolocationBatches: advancedSettings.delayBetweenGeolocationBatches
        }).toString();

        const eventSource = new EventSource(`${API_BASE_URL}/api/server-regions/${placeId}?${queryParams}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'progress') {
                updateProgressBar(data.progress, data.message);
            } else if (data.type === 'complete') {
                eventSource.close();

                // <<< --- CHANGED: Merge preview data with server results --- >>>
                const serverResults = data.results;
                // Start with the game details from the main scan (most up-to-date name/player count)
                const finalGameDetails = { ...serverResults.gameDetails };

                // If we have stored preview details for the correct game, merge them in.
                if (currentGameDetails && currentGameDetails.placeId === placeId) {
                    finalGameDetails.thumbnailUrl = currentGameDetails.thumbnailUrl;
                    finalGameDetails.visits = currentGameDetails.visits;
                }
                
                populateGameInfo(finalGameDetails);
                // <<< --- END OF CHANGE --- >>>

                setUIState('globe', serverResults);
                
                if (!serverResults.servers || serverResults.servers.length === 0) { serverListTitle.textContent = "No Servers Found"; }

                // The server now sends the final 100% update. We just wait for it to be rendered.
                // Then, hide the loader after a short delay to let the user see "Scan complete!".
                setTimeout(() => hideLoader(), 500); 
            } else if (data.type === 'error') {
                eventSource.close();
                console.error('Server-sent error:', data.message);
                updateInitialStatus(`Error: ${data.message}`, 'error');
                setUIState('search');
                updateProgressBar(0, `Scan failed: ${data.message.substring(0, 50)}...`);
                setTimeout(() => hideLoader(), 500);
            }
        };

        eventSource.onerror = (err) => {
            console.error('EventSource failed:', err);
            eventSource.close();
            // Check if it's a genuine error or just connection closing
            if (err.eventPhase === EventSource.CLOSED || err.currentTarget.readyState === EventSource.CLOSED) {
                console.log("EventSource connection was closed.");
            } else {
                updateInitialStatus('Network error or server disconnected.', 'error');
                setUIState('search');
                updateProgressBar(0, 'Connection lost!');
                setTimeout(() => hideLoader(), 500);
            }
        };

        findServersBtn.disabled = false;
    }

});