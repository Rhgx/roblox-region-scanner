import express from 'express';
import axios from 'axios';
import chalk from 'chalk';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import geoip from 'geoip-lite';
import boxen from 'boxen';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000; // Change the port here if you want to

// --- Configuration ---
let ROBLOX_COOKIE;
try {
  const configPath = path.join(__dirname, 'config.json');
  const configFile = await fs.readFile(configPath, 'utf8');
  const CONFIG = JSON.parse(configFile);

  if (!CONFIG.robloxCookie) {
    throw new Error("'robloxCookie' is missing in config.json");
  }

  ROBLOX_COOKIE = CONFIG.robloxCookie;
  console.log(chalk.green.bold('✓ Config loaded successfully'));
} catch (error) {
  console.error(
    chalk.red.bold('✗ Error loading config:'),
    chalk.yellow(error.message)
  );
  console.log(
    chalk.yellow('ℹ Please ensure config.json exists at the project root with your .ROBLOSECURITY cookie')
  );
  process.exit(1);
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
// Trust the first proxy to get the real user IP
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper Functions ---

/**
 * Calculates the Haversine distance between two points on Earth.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Estimates ping based on geographical distance and server load.
 * @param {object} userCoords - { lat, lon }
 * @param {object} serverCoords - { lat, lon }
 * @param {number} playerCount - Current number of players.
 * @param {number} maxPlayers - Maximum players for the server.
 * @returns {number} Estimated ping in milliseconds.
 */
function calculatePing(userCoords, serverCoords, playerCount, maxPlayers) {
    // 1. Calculate base ping from distance (round trip)
    // Speed of light in fiber is roughly 2/3 c, ~200,000 km/s.
    // Ping (ms) = (Distance * 2 / 200,000) * 1000 = Distance / 100
    const distance = haversineDistance(userCoords.lat, userCoords.lon, serverCoords.lat, serverCoords.lon);
    const basePing = distance / 100;

    // 2. Add a penalty based on server load.
    // A fuller server means more processing delay.
    const loadRatio = playerCount / maxPlayers;
    const loadPenalty = (loadRatio * 25) + (Math.random() * 10); // Adds up to ~35ms for a full server

    // 3. Add a small random jitter to make it look more realistic
    const jitter = Math.random() * 15; // 0-15ms random jitter

    return Math.round(basePing + loadPenalty + jitter + 40);
}

async function getGameDetails(placeId) {
  try {
    console.log(chalk.blue(`[API] Fetching game details for PlaceID: ${placeId}`));
    const universeApiUrl = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
    const universeResponse = await axios.get(universeApiUrl);
    const universeId = universeResponse.data.universeId;

    if (!universeId) {
      console.warn(chalk.yellow(`[API] ⚠ No universe found for PlaceID: ${placeId}`));
      return null;
    }

    const gameInfoApiUrl = `https://games.roblox.com/v1/games?universeIds=${universeId}`;
    const gameInfoResponse = await axios.get(gameInfoApiUrl);
    const gameName = gameInfoResponse.data.data[0]?.name || 'Unknown';
    console.log(chalk.green(`[API] ✓ Game details found: ${chalk.bold(gameName)}`));
    return gameInfoResponse.data.data[0];
  } catch (error) {
    console.error(
      chalk.red(`[API] ✗ Error fetching game details for ${placeId}:`),
      error.response?.data?.errors?.[0]?.message || error.message
    );
    return null;
  }
}

async function getPublicServers(placeId, totalServersToFetch = 100, pageLimit = 100, sendProgress) {
  let allServers = [];
  let cursor = null;
  // Maximum number of pages to fetch from Roblox API
  const maxPages = Math.ceil(totalServersToFetch / pageLimit);
  let pagesFetched = 0;
  const delayBetweenRobloxPages = 1000;

  console.log(chalk.blue(`[API] Fetching up to ${totalServersToFetch} public servers for PlaceID: ${placeId} (fetching ${pageLimit} per page, ${delayBetweenRobloxPages}ms delay between pages)`));

  try {
    while (allServers.length < totalServersToFetch && pagesFetched < maxPages) {
      if (pagesFetched > 0) { // Add delay only after the first page fetch
        await new Promise(resolve => setTimeout(resolve, delayBetweenRobloxPages));
      }

      let serversUrl = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=${pageLimit}`;
      if (cursor) {
        serversUrl += `&cursor=${cursor}`;
      }

      const response = await axios.get(serversUrl);
      const { data, nextPageCursor } = response.data;

      if (!data || data.length === 0) {
        console.log(chalk.yellow(`[API] No more servers found after ${allServers.length} total.`));
        break;
      }

      allServers.push(...data);
      console.log(chalk.green(`[API] ✓ Fetched ${data.length} servers (Total: ${allServers.length})`));

      pagesFetched++;
      cursor = nextPageCursor;
      
      // Send progress update for fetching servers phase
      sendProgress(pagesFetched, maxPages, `Fetching server list (${allServers.length}/${totalServersToFetch})...`, 0.2, allServers.length); // 0.2 is weight for phase 1

      if (!cursor || allServers.length >= totalServersToFetch) {
        break; // No more pages or desired count reached
      }
    }
    // Trim to desired count if more were fetched than requested
    allServers = allServers.slice(0, totalServersToFetch);
    console.log(chalk.green(`[API] ✓ Finished fetching. Total unique servers found: ${allServers.length}`));
    return allServers;
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn(chalk.yellow(`[API] ✗ Rate limit hit for Roblox game list API (Status: 429). Proceeding with ${allServers.length} servers fetched so far.`));
      // Return what we've managed to fetch, do not re-throw
      return allServers;
    }
    console.error(
      chalk.red(`[API] ✗ Error fetching servers for ${placeId}:`),
      error.response?.data?.errors?.[0]?.message || error.message,
      `(Status: ${error.response?.status})`
    );
    throw error; // Re-throw other, non-429 errors
  }
}

async function getServerGeoLocation(server, placeId, robloxCookie, userGeo) {
  const serverId = server.id;
  const playerCount = server.playing;
  const maxPlayers = server.maxPlayers;

  try {
    // console.log(chalk.gray(`  → Geolocating server ${serverId} (${playerCount}/${maxPlayers} players)`)); // Too verbose for console.log during SSE
    console.log(chalk.gray(`  → Geolocating server ${serverId}`)); // Re-enabled server location logging

    const authHeaders = {
      "Referer": `https://www.roblox.com/games/${placeId}/`,
      "Origin": "https://www.roblox.com",
      "User-Agent": "Roblox/WinInet",
      "Cookie": `.ROBLOSECURITY=${robloxCookie}`
    };

    const joinApiUrl = "https://gamejoin.roblox.com/v1/join-game-instance";
    const joinPayload = { placeId: Number(placeId), isTeleport: false, gameId: serverId, gameJoinAttemptId: serverId };

    const joinResponse = await axios.post(joinApiUrl, joinPayload, { headers: authHeaders });
    const joinScript = joinResponse.data.joinScript;

    if (!joinScript?.UdmuxEndpoints?.[0]?.Address) {
      console.warn(chalk.yellow(`  ⚠ No IP found for server ${serverId}`));
      return null;
    }

    const ipAddress = joinScript.UdmuxEndpoints[0].Address;
    const geoApiUrl = `https://ipwho.is/${ipAddress}`;
    const geoResponse = await axios.get(geoApiUrl);

    if (geoResponse.data && geoResponse.data.success) {
      const serverCoords = { lat: geoResponse.data.latitude, lon: geoResponse.data.longitude };
      const estimatedPing = calculatePing(userGeo, serverCoords, playerCount, maxPlayers);

      const location = `${geoResponse.data.city}, ${geoResponse.data.country}`;
      console.log(chalk.green(`  ✓ Located ${serverId}: ${chalk.bold(location)} | Ping: ~${estimatedPing}ms`)); // Re-enabled detailed location logging
      
      return {
        id: serverId,
        ip: ipAddress,
        ping: estimatedPing,
        country: geoResponse.data.country,
        countryCode: geoResponse.data.country_code,
        regionName: geoResponse.data.region,
        city: geoResponse.data.city,
        lat: serverCoords.lat,
        lon: serverCoords.lon,
        playing: playerCount,
        maxPlayers : maxPlayers
      };
    }

    console.warn(chalk.yellow(`  ⚠ Geolocation failed for ${ipAddress}: ${geoResponse.data.message}`));
    return null;
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.warn(chalk.yellow(`  ⚠ Auth error for server ${serverId}: Cookie may be invalid`));
    } else if (error.response?.status === 429) {
      console.warn(chalk.yellow('  ⚠ Geolocation service rate limit exceeded (ipwho.is)'));
    } else {
      console.error(chalk.red(`  ✗ Geolocation error for server ${serverId}:`), error.message);
    }
    return null;
  }
}

// --- New Function for Game Preview ---
async function getGamePreview(placeId) {
  try {
    console.log(chalk.blue(`[API-PREVIEW] Fetching game preview for PlaceID: ${placeId}`));
    const universeApiUrl = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
    const universeResponse = await axios.get(universeApiUrl);
    const universeId = universeResponse.data.universeId;

    if (!universeId) {
      console.warn(chalk.yellow(`[API-PREVIEW] ⚠ No universe found for PlaceID: ${placeId}`));
      return null;
    }

    const gameInfoApiUrl = `https://games.roblox.com/v1/games?universeIds=${universeId}`;
    const thumbnailApiUrl = `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`;

    // Fetch game details and thumbnail in parallel
    const [gameInfoResponse, thumbnailResponse] = await Promise.all([
      axios.get(gameInfoApiUrl),
      axios.get(thumbnailApiUrl)
    ]);
    
    const gameDetails = gameInfoResponse.data.data[0];
    const thumbnailDetails = thumbnailResponse.data.data[0];

    if (!gameDetails) {
        console.warn(chalk.yellow(`[API-PREVIEW] ⚠ No game details found for UniverseID: ${universeId}`));
        return null;
    }
    
    console.log(chalk.green(`[API-PREVIEW] ✓ Preview found: ${chalk.bold(gameDetails.name)}`));
    
    return {
        name: gameDetails.name,
        playing: gameDetails.playing,
        visits: gameDetails.visits,
        thumbnailUrl: thumbnailDetails?.imageUrl || null
    };

  } catch (error) {
    if (error.response?.status === 400 || error.response?.status === 404) {
        console.log(chalk.gray(`[API-PREVIEW] Game not found for PlaceID ${placeId}.`));
    } else {
        console.error(
          chalk.red(`[API-PREVIEW] ✗ Error fetching game preview for ${placeId}:`),
          error.response?.data?.errors?.[0]?.message || error.message
        );
    }
    return null;
  }
}

// --- API Endpoints ---
app.get('/api/game-preview/:placeId', async (req, res) => {
  const placeId = parseInt(req.params.placeId, 10);
  
  if (isNaN(placeId) || placeId <= 0) {
      return res.status(400).json({ message: 'Invalid PlaceID format' });
  }

  try {
      const previewData = await getGamePreview(placeId);
      if (previewData) {
          res.status(200).json(previewData);
      } else {
          res.status(404).json({ message: 'Game not found' });
      }
  } catch (error) {
      res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/server-regions/:placeId', async (req, res) => {
  const startTime = Date.now();
  const placeId = parseInt(req.params.placeId, 10);
  
  // Get advanced settings from query parameters
  const serversToScan = Math.min(300, parseInt(req.query.serversToScan, 10) || 100); // Clamped to 300
  const batchSize = parseInt(req.query.batchSize, 10) || 5;
  const delayBetweenGeolocationBatches = parseInt(req.query.delayBetweenGeolocationBatches, 10) || 500;
  const robloxApiPageLimit = 100; // Fixed for Roblox games API

  const userIp = req.ip;
  const geo = geoip.lookup(userIp);
  const userGeo = geo ? { lat: geo.ll[0], lon: geo.ll[1] } : { lat: 41.05, lon: 29.04 }; // Default to Türkiye if IP is local/un-locatable (Change this if you live somewhere else)

  const requestTitle = `Request for PlaceID: ${placeId} from ${userIp} (${geo ? geo.city : 'Local'})\nServers: ${serversToScan}, Batch: ${batchSize}, Delay: ${delayBetweenGeolocationBatches}ms`;
  console.log(boxen(chalk.cyan.bold(requestTitle), { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'cyan' }));
  
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Helper to send SSE data
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Progress update helper for SSE
  let actualServersFetched = 0;
  const sendProgress = (current_item, total_items, message, phase_overall_weight, total_overall_servers_fetched_val = 0) => {
    actualServersFetched = total_overall_servers_fetched_val || actualServersFetched;

    let overallProgress = 0;
    const phase1Weight = 0.2; // Weight for fetching Roblox server list
    const phase2Weight = 0.8; // Weight for geolocation

    if (phase_overall_weight === phase1Weight) { // Phase 1: Fetching Roblox servers
      overallProgress = (current_item / total_items) * phase1Weight;
    } else { // Phase 2: Geolocating
      // total_items here is the actualServersFetched from phase 1
      const totalForPhase2 = total_items > 0 ? total_items : 1; // Avoid division by zero
      overallProgress = phase1Weight + (current_item / totalForPhase2) * phase2Weight;
    }
    
    // Clamp between 0 and 1
    overallProgress = Math.max(0, Math.min(1, overallProgress));
    sendEvent('message', { type: 'progress', progress: overallProgress, message: message });
  };


  if (isNaN(placeId)) {
    console.warn(chalk.yellow(`[WARN] Invalid PlaceID received: ${req.params.placeId}`));
    sendEvent('message', { type: 'error', message: "Invalid PlaceID" });
    res.end();
    return;
  }

  try {
    // Phase 1: Fetch game details and public servers from Roblox
    sendProgress(0, 1, 'Fetching game details...', 0.2); // Initial progress before any fetching
    const gameDetails = await getGameDetails(placeId);
    
    const robloxServers = await getPublicServers(placeId, serversToScan, robloxApiPageLimit, sendProgress);
    actualServersFetched = robloxServers.length; // Store actual count for Phase 2 scaling
    
    if (robloxServers.length === 0) {
      console.warn(chalk.yellow('[WARN] No public servers found. Returning empty result.'));
      // Send a final 100% progress update because the scan is technically complete.
      sendProgress(1, 1, 'Scan complete: No public servers found.', 0.8, 1);
      sendEvent('message', { type: 'complete', results: { gameDetails: gameDetails || {}, servers: [] } });
      res.end();
      return;
    }

    // Phase 2: Geolocate fetched servers
    console.log(chalk.blue.bold(`\n[GEO] Geolocating ${robloxServers.length} servers (Batch Size: ${batchSize}, Delay: ${delayBetweenGeolocationBatches}ms)...`));

    const locatedServers = [];
    let successCount = 0;
    let failCount = 0;

    // Process servers in batches for geolocation
    for (let i = 0; i < robloxServers.length; i += batchSize) {
      const batch = robloxServers.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      console.log(chalk.blue(`\n[GEO] ⌛ Processing batch #${batchNumber} (servers ${i + 1}-${Math.min(i + batchSize, robloxServers.length)})`));

      const geoPromises = batch.map(server =>
        getServerGeoLocation(server, placeId, ROBLOX_COOKIE, userGeo)
      );

      const results = await Promise.allSettled(geoPromises);
      let geolocatedInBatch = 0;

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          locatedServers.push(result.value);
          successCount++;
          geolocatedInBatch++;
        } else {
          failCount++;
        }
      });
      
      // Update progress after each batch
      sendProgress(locatedServers.length, actualServersFetched, `Geolocating servers (${locatedServers.length}/${actualServersFetched})...`, 0.8);

      // Apply delay between geolocation batches
      if (i + batchSize < robloxServers.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenGeolocationBatches));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const summary = [
        `${chalk.green.bold('✓ Request Completed')}`,
        ``,
        `${chalk.white('Duration:')} ${chalk.yellow(`${duration}s`)}`,
        `${chalk.white('Servers Found:')} ${chalk.cyan(actualServersFetched)}`,
        `${chalk.white('Located:')} ${chalk.green(successCount)}`,
        `${chalk.white('Failed:')} ${chalk.red(failCount)}`
    ].join('\n');

    console.log(boxen(summary, { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));

    // Send a final 100% progress update before completion to ensure the bar reaches the end.
    sendProgress(actualServersFetched, actualServersFetched, 'Scan complete!', 0.8);
    
    sendEvent('message', { type: 'complete', results: { gameDetails: gameDetails || {}, servers: locatedServers } });
    res.end();

  } catch (error) {
    console.error(chalk.red.bold(`[CRITICAL] ✗ Critical error for PlaceID ${placeId}:`), error);
    sendEvent('message', { type: 'error', message: error.response?.data?.errors?.[0]?.message || error.message || "Internal server error" });
    res.end();
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  const title = chalk.greenBright.bold('Roblox Region Scanner');
  const details = [
    `${chalk.white('Server is running on')} ${chalk.cyan(`http://localhost:${PORT}`)}`,
    `${chalk.white('Frontend accessible at')} ${chalk.cyan(`http://localhost:${PORT}/`)}`
  ].join('\n');

  console.log(boxen(`${title}\n\n${details}`, {
    padding: 1,
    margin: 1,
    borderStyle: 'classic',
    borderColor: 'greenBright',
    titleAlignment: 'center',
    textAlignment: 'center'
  }));
});
