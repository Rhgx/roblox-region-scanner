// 📁 src/services/roblox.js

import axios from "axios";
import chalk from "chalk";
import { calculatePing } from "../utils/geo.js";

export async function getGameDetails(placeId) {
  try {
    console.log(
      chalk.blue(`[API] Fetching game details for PlaceID: ${placeId}`)
    );
    const universeApiUrl = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
    const universeResponse = await axios.get(universeApiUrl);
    const universeId = universeResponse.data.universeId;

    if (!universeId) {
      console.warn(
        chalk.yellow(`[API] ⚠ No universe found for PlaceID: ${placeId}`)
      );
      return null;
    }

    const gameInfoApiUrl = `https://games.roblox.com/v1/games?universeIds=${universeId}`;
    const gameInfoResponse = await axios.get(gameInfoApiUrl);
    const gameName = gameInfoResponse.data.data[0]?.name || "Unknown";
    console.log(
      chalk.green(`[API] ✓ Game details found: ${chalk.bold(gameName)}`)
    );
    return gameInfoResponse.data.data[0];
  } catch (error) {
    console.error(
      chalk.red(`[API] ✗ Error fetching game details for ${placeId}:`),
      error.response?.data?.errors?.[0]?.message || error.message
    );
    return null;
  }
}

export async function getPublicServers(
  placeId,
  totalServersToFetch = 100,
  pageLimit = 100,
  sendProgress
) {
  let allServers = [];
  let cursor = null;
  const maxPages = Math.ceil(totalServersToFetch / pageLimit);
  let pagesFetched = 0;
  const delayBetweenRobloxPages = 1000;

  console.log(
    chalk.blue(
      `[API] Fetching up to ${totalServersToFetch} public servers for PlaceID: ${placeId} (fetching ${pageLimit} per page, ${delayBetweenRobloxPages}ms delay between pages)`
    )
  );

  try {
    while (allServers.length < totalServersToFetch && pagesFetched < maxPages) {
      if (pagesFetched > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenRobloxPages)
        );
      }

      let serversUrl = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=${pageLimit}`;
      if (cursor) {
        serversUrl += `&cursor=${cursor}`;
      }

      const response = await axios.get(serversUrl);
      const { data, nextPageCursor } = response.data;

      if (!data || data.length === 0) {
        console.log(
          chalk.yellow(
            `[API] No more servers found after ${allServers.length} total.`
          )
        );
        break;
      }

      allServers.push(...data);
      console.log(
        chalk.green(
          `[API] ✓ Fetched ${data.length} servers (Total: ${allServers.length})`
        )
      );

      pagesFetched++;
      cursor = nextPageCursor;

      sendProgress(
        pagesFetched,
        maxPages,
        `Fetching server list (${allServers.length}/${totalServersToFetch})...`,
        0.2,
        allServers.length
      );

      if (!cursor || allServers.length >= totalServersToFetch) {
        break;
      }
    }
    allServers = allServers.slice(0, totalServersToFetch);
    console.log(
      chalk.green(
        `[API] ✓ Finished fetching. Total unique servers found: ${allServers.length}`
      )
    );
    return allServers;
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn(
        chalk.yellow(
          `[API] ✗ Rate limit hit for Roblox game list API. Proceeding with ${allServers.length} servers.`
        )
      );
      return allServers;
    }
    console.error(
      chalk.red(`[API] ✗ Error fetching servers for ${placeId}:`),
      error.response?.data?.errors?.[0]?.message || error.message,
      `(Status: ${error.response?.status})`
    );
    throw error;
  }
}

export async function getServerGeoLocation(
  server,
  placeId,
  robloxCookie,
  userGeo
) {
  const serverId = server.id;
  const playerCount = server.playing;
  const maxPlayers = server.maxPlayers;

  try {
    console.log(
      chalk.gray(
        `  → Geolocating server ${serverId} (${playerCount}/${maxPlayers} players)`
      )
    );

    const authHeaders = {
      Referer: `https://www.roblox.com/games/${placeId}/`,
      Origin: "https://www.roblox.com",
      "User-Agent": "Roblox/WinInet",
      Cookie: `.ROBLOSECURITY=${robloxCookie}`,
    };

    const joinApiUrl = "https://gamejoin.roblox.com/v1/join-game-instance";
    const joinPayload = {
      placeId: Number(placeId),
      isTeleport: false,
      gameId: serverId,
      gameJoinAttemptId: serverId,
    };

    const joinResponse = await axios.post(joinApiUrl, joinPayload, {
      headers: authHeaders,
    });
    const joinScript = joinResponse.data.joinScript;

    if (!joinScript?.UdmuxEndpoints?.[0]?.Address) {
      console.warn(chalk.yellow(`  ⚠ No IP found for server ${serverId}`));
      return null;
    }

    const ipAddress = joinScript.UdmuxEndpoints[0].Address;
    const geoApiUrl = `https://ipwho.is/${ipAddress}`;
    const geoResponse = await axios.get(geoApiUrl);

    if (geoResponse.data && geoResponse.data.success) {
      const serverCoords = {
        lat: geoResponse.data.latitude,
        lon: geoResponse.data.longitude,
      };
      const estimatedPing = calculatePing(
        userGeo,
        serverCoords,
        playerCount,
        maxPlayers
      );
      const location = `${geoResponse.data.city}, ${geoResponse.data.country}`;
      console.log(
        chalk.green(
          `  ✓ Located ${serverId}: ${chalk.bold(
            location
          )} | Ping: ~${estimatedPing}ms`
        )
      );

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
        maxPlayers: maxPlayers,
      };
    }

    console.warn(
      chalk.yellow(
        `  ⚠ Geolocation failed for ${ipAddress}: ${geoResponse.data.message}`
      )
    );
    return null;
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.warn(
        chalk.yellow(
          `  ⚠ Auth error for server ${serverId}: Cookie may be invalid`
        )
      );
    } else if (error.response?.status === 429) {
      console.warn(
        chalk.yellow("  ⚠ Geolocation service rate limit exceeded (ipwho.is)")
      );
    } else {
      console.error(
        chalk.red(`  ✗ Geolocation error for server ${serverId}:`),
        error.message
      );
    }
    return null;
  }
}

export async function getGamePreview(placeId) {
  try {
    console.log(
      chalk.blue(`[API-PREVIEW] Fetching game preview for PlaceID: ${placeId}`)
    );
    const universeApiUrl = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
    const universeResponse = await axios.get(universeApiUrl);
    const universeId = universeResponse.data.universeId;

    if (!universeId) {
      console.warn(
        chalk.yellow(
          `[API-PREVIEW] ⚠ No universe found for PlaceID: ${placeId}`
        )
      );
      return null;
    }

    const gameInfoApiUrl = `https://games.roblox.com/v1/games?universeIds=${universeId}`;
    const thumbnailApiUrl = `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`;

    const [gameInfoResponse, thumbnailResponse] = await Promise.all([
      axios.get(gameInfoApiUrl),
      axios.get(thumbnailApiUrl),
    ]);

    const gameDetails = gameInfoResponse.data.data[0];
    const thumbnailDetails = thumbnailResponse.data.data[0];

    if (!gameDetails) {
      console.warn(
        chalk.yellow(
          `[API-PREVIEW] ⚠ No game details found for UniverseID: ${universeId}`
        )
      );
      return null;
    }

    console.log(
      chalk.green(
        `[API-PREVIEW] ✓ Preview found: ${chalk.bold(gameDetails.name)}`
      )
    );

    return {
      name: gameDetails.name,
      playing: gameDetails.playing,
      visits: gameDetails.visits,
      thumbnailUrl: thumbnailDetails?.imageUrl || null,
    };
  } catch (error) {
    if (error.response?.status === 400 || error.response?.status === 404) {
      console.log(
        chalk.gray(`[API-PREVIEW] Game not found for PlaceID ${placeId}.`)
      );
    } else {
      console.error(
        chalk.red(
          `[API-PREVIEW] ✗ Error fetching game preview for ${placeId}:`
        ),
        error.response?.data?.errors?.[0]?.message || error.message
      );
    }
    return null;
  }
}
