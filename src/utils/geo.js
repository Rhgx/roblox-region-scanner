// src/utils/geo.js

/**
 * Calculates the Haversine distance between two points on Earth.
 * @returns {number} Distance in kilometers.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimates ping based on geographical distance and server load.
 * @returns {number} Estimated ping in milliseconds.
 */
export function calculatePing(
  userCoords,
  serverCoords,
  playerCount,
  maxPlayers
) {
  const distance = haversineDistance(
    userCoords.lat,
    userCoords.lon,
    serverCoords.lat,
    serverCoords.lon
  );
  // Base ping from distance (round trip). Speed of light in fiber is ~200,000 km/s.
  const basePing = distance / 100;
  // Penalty based on server load.
  const loadRatio = playerCount / maxPlayers;
  const loadPenalty = loadRatio * 25 + Math.random() * 10;
  // Random jitter to make it look more realistic
  const jitter = Math.random() * 15;

  return Math.round(basePing + loadPenalty + jitter + 40);
}
