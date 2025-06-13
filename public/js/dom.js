// 📁 public/js/dom.js

export const appTitleLink = document.getElementById("appTitleLink");
export const appHeader = document.querySelector(".app-header");
export const initialView = document.getElementById("initialView");
export const placeIdInput = document.getElementById("placeIdInput");
export const findServersBtn = document.getElementById("findServersBtn");
export const initialStatusMessage = document.getElementById(
  "initialStatusMessage"
);

export const toggleAdvancedSettings = document.getElementById(
  "toggleAdvancedSettings"
);
export const advancedSettingsPanel = document.getElementById(
  "advancedSettingsPanel"
);
export const serversToScanInput = document.getElementById("serversToScanInput");
export const serversToScanValue = document.getElementById("serversToScanValue");
export const batchSizeInput = document.getElementById("batchSizeInput");
export const delayBetweenGeolocationBatchesInput = document.getElementById(
  "delayBetweenGeolocationBatchesInput"
);
export const mainView = document.getElementById("mainView");

// Game Preview Elements
export const gamePreviewPanel = document.getElementById("gamePreviewPanel");
export const gamePreviewThumbnail = document.getElementById(
  "gamePreviewThumbnail"
);
export const gamePreviewName = document.getElementById("gamePreviewName");
export const gamePreviewPlaying = document.getElementById("gamePreviewPlaying");
export const gamePreviewVisits = document.getElementById("gamePreviewVisits");

// Main View Elements
export const globeElement = document.getElementById("globeViz");
export const gameInfoThumbnail = document.getElementById("gameInfoThumbnail");
export const gameInfoName = document.getElementById("gameInfoName");
export const gameInfoPlaying = document.getElementById("gameInfoPlaying");
export const gameInfoVisits = document.getElementById("gameInfoVisits");
export const serverListTitle = document.getElementById("serverListTitle");
export const serverListContent = document.getElementById("serverListContent");
export const serverListPlaceholderClass = "list-placeholder";

// Loader Elements
export const loaderOverlay = document.getElementById("loaderOverlay");
export const loaderMessage = document.getElementById("loaderMessage");
export const progressBar = document.querySelector(".progress-bar");
export const progressText = document.querySelector(".progress-text");

// Sidebar & Filter Elements
export const sidebarTabs = document.querySelector(".sidebar-tabs");
export const tabPanes = document.querySelectorAll(".tab-pane");
export const regionFilter = document.getElementById("regionFilter");
export const maxPingFilter = document.getElementById("maxPingFilter");
export const maxPingValue = document.getElementById("maxPingValue");
export const filterStatusMessage = document.getElementById(
  "filterStatusMessage"
);
export const sortBySelect = document.getElementById("sortBySelect");
export const sortOrderBtn = document.getElementById("sortOrderBtn");
export const sortOrderIcon = document.getElementById("sortOrderIcon");
