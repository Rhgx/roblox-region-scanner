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

async function getPublicServers(placeId) {
  try {
    console.log(chalk.blue(`[API] Fetching public servers for PlaceID: ${placeId}`));
    const serversUrl = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;
    const response = await axios.get(serversUrl);
    const servers = response.data.data || [];
    console.log(chalk.green(`[API] ✓ Found ${servers.length} public servers`));
    return servers;
  } catch (error) {
    console.error(
      chalk.red(`[API] ✗ Error fetching servers for ${placeId}:`),
      error.response?.data?.errors?.[0]?.message || error.message
    );
    return [];
  }
}

async function getServerGeoLocation(server, placeId, robloxCookie, userGeo) {
  const serverId = server.id;
  const playerCount = server.playing;
  const maxPlayers = server.maxPlayers;
  
  try {
    console.log(chalk.gray(`  → Geolocating server ${serverId} (${playerCount}/${maxPlayers} players)`));
    
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
      console.log(chalk.green(`  ✓ Located ${serverId}: ${chalk.bold(location)} | Ping: ~${estimatedPing}ms`));

      return {
        id: serverId,
        ip: ipAddress,
        ping: estimatedPing,
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
      console.warn(chalk.yellow('  ⚠ Rate limit exceeded for geolocation service'));
    } else {
      console.error(chalk.red(`  ✗ Geolocation error for server ${serverId}:`), error.message);
    }
    return null;
  }
}

// --- API Endpoint ---
app.get('/api/server-regions/:placeId', async (req, res) => {
  const startTime = Date.now();
  const placeId = parseInt(req.params.placeId, 10);
  
  const userIp = req.ip;
  const geo = geoip.lookup(userIp);
  const userGeo = geo ? { lat: geo.ll[0], lon: geo.ll[1] } : { lat: 41.05, lon: 29.04 }; // Default to Türkiye if IP is local/un-locatable (Change this if you live somewhere else)
  
  const requestTitle = `Request for PlaceID: ${placeId} from ${userIp} (${geo ? geo.city : 'Local'})`;
  console.log(boxen(chalk.cyan.bold(requestTitle), { padding: 1, margin: 1, borderStyle: 'double', borderColor: 'cyan' }));
  
  if (isNaN(placeId)) {
    console.warn(chalk.yellow(`[WARN] Invalid PlaceID received: ${req.params.placeId}`));
    return res.status(400).json({ error: "Invalid PlaceID" });
  }
  
  try {
    const [gameDetails, robloxServers] = await Promise.all([
      getGameDetails(placeId),
      getPublicServers(placeId)
    ]);
    
    if (robloxServers.length === 0) {
      console.warn(chalk.yellow('[WARN] No public servers found. Returning empty result.'));
      return res.json({ gameDetails: gameDetails || {}, servers: [] });
    }
    
    console.log(chalk.blue.bold(`\n[GEO] Geolocating ${robloxServers.length} servers...`));
    
    const locatedServers = [];
    const batchSize = 5;
    const delayBetweenBatches = 500; // 500 ms delay to avoid rate limiting
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < robloxServers.length; i += batchSize) {
      const batch = robloxServers.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      console.log(chalk.blue(`\n[GEO] ⌛ Processing batch #${batchNumber} (servers ${i + 1}-${Math.min(i + batchSize, robloxServers.length)})`));
      
      const geoPromises = batch.map(server => 
        getServerGeoLocation(server, placeId, ROBLOX_COOKIE, userGeo)
      );
      
      const results = await Promise.allSettled(geoPromises);
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          locatedServers.push(result.value);
          successCount++;
        } else {
          failCount++;
        }
      });
      
      if (i + batchSize < robloxServers.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const summary = [
        `${chalk.green.bold('✓ Request Completed')}`,
        ``,
        `${chalk.white('Duration:')} ${chalk.yellow(`${duration}s`)}`,
        `${chalk.white('Servers Found:')} ${chalk.cyan(robloxServers.length)}`,
        `${chalk.white('Located:')} ${chalk.green(successCount)}`,
        `${chalk.white('Failed:')} ${chalk.red(failCount)}`
    ].join('\n');

    console.log(boxen(summary, { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));
    
    res.json({ 
      gameDetails: gameDetails || {}, 
      servers: locatedServers 
    });
  } catch (error) {
    console.error(chalk.red.bold(`[CRITICAL] ✗ Critical error for PlaceID ${placeId}:`), error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  const title = chalk.greenBright.bold('Roblox Server Locator');
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