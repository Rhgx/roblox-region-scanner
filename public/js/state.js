// 📁 public/js/state.js

// --- Main Data Stores ---
export let allServers = [];
export let currentGameDetails = null; // Stored preview data
export let currentPlaceIdForJoin = null;
export let currentPreviewPlaceId = null; // The ID the preview panel is currently showing

export function setAllServers(servers) {
  allServers = servers;
}
export function setCurrentGameDetails(details) {
  currentGameDetails = details;
}
export function setCurrentPlaceIdForJoin(id) {
  currentPlaceIdForJoin = id;
}
export function setCurrentPreviewPlaceId(id) {
  currentPreviewPlaceId = id;
}

// --- Filter & Sort State ---
export const currentFilters = { region: "all", maxPing: 500 };
export const animatedFilters = { maxPing: 500 };
export const currentSort = { by: "ping", order: "asc" };

// --- Advanced Settings State & Persistence ---
export const advancedSettings = {
  serversToScan: 100,
  batchSize: 5,
  delayBetweenGeolocationBatches: 500,
  isPanelOpen: false,
};

export function loadAdvancedSettings() {
  const stored = localStorage.getItem("advancedSettings");
  if (stored) {
    const parsed = JSON.parse(stored);
    advancedSettings.serversToScan = Math.max(
      100,
      Math.min(300, parseInt(parsed.serversToScan, 10) || 100)
    );
    advancedSettings.batchSize = Math.max(
      1,
      Math.min(20, parseInt(parsed.batchSize, 10) || 5)
    );
    advancedSettings.delayBetweenGeolocationBatches = Math.max(
      0,
      Math.min(5000, parseInt(parsed.delayBetweenGeolocationBatches, 10) || 500)
    );
  }
}

export function saveAdvancedSettings() {
  localStorage.setItem("advancedSettings", JSON.stringify(advancedSettings));
}
