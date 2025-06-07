document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const appTitleLink = document.getElementById('appTitleLink');
    const initialView = document.getElementById('initialView');
    const placeIdInput = document.getElementById('placeIdInput');
    const findServersBtn = document.getElementById('findServersBtn');
    const initialStatusMessage = document.getElementById('initialStatusMessage');

    const mainView = document.getElementById('mainView');
    const globeElement = document.getElementById('globeViz');

    const gameInfoPanel = document.getElementById('gameInfoPanel');
    const serverListTitle = document.getElementById('serverListTitle');
    const serverListContent = document.getElementById('serverListContent');
    const serverListPlaceholderClass = 'list-placeholder';

    const loaderOverlay = document.getElementById('loaderOverlay');
    const loaderMessage = document.getElementById('loaderMessage');

    // --- State & Config ---
    const API_BASE_URL = '';
    let globe;
    let globeInitialized = false;
    let currentPlaceIdForJoin = null;

    // --- UI State Management & Animations ---
    function setUIState(stateName, serverData = null) {
        const animParams = { duration: 450, easing: 'easeOutCubic' };

        if (stateName === 'globe') {
            initialView.style.pointerEvents = 'none';
            anime({
                targets: initialView,
                opacity: [1, 0],
                translateY: [0, -25],
                scale: [1, 0.97],
                ...animParams,
                duration: animParams.duration * 0.7,
                complete: () => { initialView.style.display = 'none'; }
            });

            mainView.style.display = 'flex';
            mainView.style.opacity = 0;
            mainView.style.transform = 'translateY(25px)';
            anime({
                targets: mainView,
                opacity: [0, 1],
                translateY: ['25px', '0px'],
                ...animParams,
                delay: animParams.duration * 0.2,
                complete: () => {
                    mainView.style.pointerEvents = 'auto';
                    if (!globeInitialized) {
                        initGlobe();
                    }
                    if (globeInitialized && globe) {
                        globe.width(globeElement.parentElement.offsetWidth);
                        globe.height(globeElement.parentElement.offsetHeight);
                    }
                    if (serverData && serverData.servers && serverData.servers.length > 0) {
                        addServersToGlobe(serverData.servers);
                    } else {
                        addServersToGlobe([]);
                        populateServerList([]);
                    }
                }
            });
        } else { // 'search' state
            mainView.style.pointerEvents = 'none';
            anime({
                targets: mainView,
                opacity: [mainView.style.opacity || 1, 0],
                translateY: ['0px', '25px'],
                ...animParams,
                duration: animParams.duration * 0.7,
                complete: () => { mainView.style.display = 'none'; }
            });

            initialView.style.display = 'flex';
            initialView.style.opacity = 0;
            initialView.style.transform = 'translateY(-25px) scale(0.97)';
            anime({
                targets: initialView,
                opacity: [0, 1],
                translateY: ['-25px', '0px'],
                scale: [0.97, 1],
                ...animParams,
                delay: animParams.duration * 0.2,
                begin: () => { initialView.style.pointerEvents = 'auto';}
            });
            updateInitialStatus('Enter a Place ID to begin.');
            clearServerListAndGameInfo();
        }
    }

    function showLoader(message = 'Loading...') {
        loaderMessage.textContent = message;
        loaderOverlay.style.opacity = 0;
        loaderOverlay.style.display = 'flex';
        anime({ targets: loaderOverlay, opacity: [0, 1], duration: 250, easing: 'linear' });
    }

    function hideLoader() {
        anime({
            targets: loaderOverlay,
            opacity: [1, 0],
            duration: 300,
            easing: 'linear',
            complete: () => { loaderOverlay.style.display = 'none'; }
        });
    }

    function updateInitialStatus(message, type = 'default') {
        initialStatusMessage.textContent = message;
        initialStatusMessage.className = 'status-message';
        if (type !== 'default') initialStatusMessage.classList.add(type);
    }

    function populateGameInfo(details) {
        if (details && details.name) {
            gameInfoPanel.innerHTML = `
                <p><strong class="highlight">Game:</strong> ${details.name}</p>
                <p><strong class="highlight">Creator:</strong> ${details.creator?.name || 'N/A'}</p>
                <p><strong class="highlight">Playing:</strong> ${details.playing !== undefined ? details.playing.toLocaleString() : 'N/A'}</p>
            `;
        } else {
            gameInfoPanel.innerHTML = '<p class="text-muted">Game details not available.</p>';
        }
    }

    function populateServerList(servers) {
        serverListContent.innerHTML = '';

        if (!servers || servers.length === 0) {
            serverListContent.innerHTML = `<p class="${serverListPlaceholderClass}">Click a server location on the globe.</p>`;
            serverListTitle.textContent = "Server Details";
            return;
        }

        let titleText = servers.length > 1 ? `Servers in ${servers[0].city} (${servers.length})` : `Server Details`;
        if (servers.length === 1) {
             const props = servers[0];
             titleText = `Server: ${props.city || 'Unknown Location'}`;
        }
        serverListTitle.textContent = titleText;

        servers.forEach((server, index) => {
            const playerCountStr = (typeof server.playing === 'number' && typeof server.maxPlayers === 'number')
                ? `${server.playing}/${server.maxPlayers} <span class="player-count-caveat">(delayed)</span>`
                : 'N/A';

            const itemDiv = document.createElement('div');
            itemDiv.className = 'server-item';
            itemDiv.innerHTML = `
                <div class="server-item-details">
                    ${servers.length > 1 ? `<strong class="highlight">Server ${index + 1}</strong><br>` : ''}
                    <span class="detail-label">Location:</span> <span>${server.city || 'N/A'}, ${server.regionName || 'N/A'} (${server.countryCode || 'N/A'})</span><br>
                    <span class="detail-label">Players:</span> <span>${playerCountStr}</span><br>
                    <span class="detail-label">Ping:</span> <span>${server.ping || 'N/A'}ms (estimate)</span><br>
                    <span class="detail-label">Server ID:</span> <span>${server.id || 'N/A'}</span>
                </div>
                <button class="btn btn-sm btn-success join-button-list" data-placeid="${currentPlaceIdForJoin}" data-serverid="${server.id}">Join</button>
            `;
            serverListContent.appendChild(itemDiv);
        });
    }

    function clearServerListAndGameInfo() {
        serverListContent.innerHTML = `<p class="${serverListPlaceholderClass}">Click a server location on the globe.</p>`;
        serverListTitle.textContent = "Server Details";
        gameInfoPanel.innerHTML = '';
    }

    function initGlobe() {
        if (!globeElement) {
            console.error("Globe element (#globeViz) not found.");
            return;
        }

        globe = Globe()
            (globeElement)
            .globeImageUrl('assets/equirectangular-projection-test.png')
            .bumpImageUrl('')
            .backgroundImageUrl('/assets/background.png')
            .backgroundColor('rgba(13, 17, 23, 1)')
            .showAtmosphere(true)
            .atmosphereColor('#58a6ff')
            .atmosphereAltitude(0.25)

            // 1. Invisible Points for Hitbox/Interaction
            .pointsData([])
            .pointLat('lat')
            .pointLng('lon')
            .pointColor(() => 'rgba(0,0,0,0)') // Transparent
            .pointAltitude(0.01)
            .pointRadius(1)
            .pointLabel(p => `<b>${p.servers[0].city}</b> (${p.servers.length} server${p.servers.length > 1 ? 's' : ''})`)
            .onPointClick(location => {
                populateServerList(location.servers);
                globe.pointOfView({ lat: location.lat, lng: location.lon, altitude: 1.5 }, 700);
            })

            // 2. 2D HTML Elements for Visuals
            .htmlElementsData([])
            .htmlLat('lat')
            .htmlLng('lon')
            .htmlElement(() => {
                const el = document.createElement('div');
                el.innerHTML = `<div class="globe-ping"><div class="dot"></div><div class="pulse"></div></div>`;
                return el;
            })

            .onGlobeClick(() => {
                populateServerList([]);
            });

        window.addEventListener('resize', () => {
             if (globeElement.parentElement.offsetWidth > 0) {
                 globe.width(globeElement.parentElement.offsetWidth);
                 globe.height(globeElement.parentElement.offsetHeight);
             }
        });
        globe.width(globeElement.parentElement.offsetWidth);
        globe.height(globeElement.parentElement.offsetHeight);
        globeInitialized = true;
    }

    function addServersToGlobe(servers) {
        if (!globeInitialized) {
            console.warn("addServersToGlobe called, but globe is not ready.");
            return;
        }

        if (!servers || servers.length === 0) {
            globe.pointsData([]);
            globe.htmlElementsData([]);
            globe.pointOfView({ lat: 0, lng: 0, altitude: 3.5 }, 1500);
            return;
        }
        
        // Group servers by location
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
        
        // Update both layers with the same compiled data
        globe.pointsData(compiledData);
        globe.htmlElementsData(compiledData);

        if (compiledData.length > 0) {
            globe.pointOfView({ lat: 41.05, lng: 29.04, altitude: 2.2 }, 1500);
        }
    }

    async function handleSearch() {
        const placeId = placeIdInput.value.trim();
        if (!placeId || isNaN(placeId)) {
            updateInitialStatus('Please enter a valid Place ID.', 'error');
            anime({ targets: placeIdInput, translateX: [{value:5},{value:-5},{value:5},{value:0}], duration: 300, easing: 'easeInOutSine'});
            return;
        }

        currentPlaceIdForJoin = placeId;
        findServersBtn.disabled = true;
        showLoader('Locating servers across the globe...');
        updateInitialStatus('Searching for servers...', 'loading');

        try {
            const response = await fetch(`${API_BASE_URL}/api/server-regions/${placeId}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            const data = await response.json();
            
            setUIState('globe', data);
            populateGameInfo(data.gameDetails);
            
            if (!data.servers || data.servers.length === 0) {
                 serverListTitle.textContent = "No Servers Found";
            }

        } catch (error) {
            console.error('Error fetching server data:', error);
            updateInitialStatus(`Error: ${error.message}`, 'error');
            setUIState('search');
        } finally {
            findServersBtn.disabled = false;
            hideLoader();
        }
    }

    // --- Event Listeners ---
    findServersBtn.addEventListener('click', handleSearch);
    placeIdInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') handleSearch(); });

    if (appTitleLink) {
        appTitleLink.addEventListener('click', () => {
            if (mainView.style.display === 'flex') {
                setUIState('search');
                placeIdInput.value = '';
            }
        });
    }

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
            } else { console.error("Missing placeId or serverId for join button", targetButton.dataset); }
        }
    });

    // --- Initial Setup ---
    setUIState('search');
    initialView.style.opacity = 1;
    initialView.style.transform = 'translateY(0px) scale(1)';
    initialView.style.pointerEvents = 'auto';
    mainView.style.display = 'none';
    mainView.style.opacity = 0;
    mainView.style.pointerEvents = 'none';
});