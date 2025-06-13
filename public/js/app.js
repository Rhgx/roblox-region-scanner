// 📁 public/js/app.js

import * as dom from "./dom.js";
import * as state from "./state.js";
import * as ui from "./ui.js";
import * as globe from "./globe.js";
import * as api from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
  // --- INITIALIZATION ---
  let isGlobeInitialized = false;
  let previewDebounceTimer;

  state.loadAdvancedSettings();
  ui.runIntroAnimation();
  setupEventListeners();

  // --- CORE LOGIC ---
  function sortServers(servers) {
    const { by, order } = state.currentSort;
    const sorted = [...servers];

    sorted.sort((a, b) => {
      let valA = a[by],
        valB = b[by];
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      const modifier = by === "playing" ? -1 : 1;
      if (valA < valB) return order === "asc" ? -1 * modifier : 1 * modifier;
      if (valA > valB) return order === "asc" ? 1 * modifier : -1 * modifier;
      return 0;
    });

    return sorted;
  }

  function applyFiltersAndRender() {
    let filtered = [...state.allServers];
    if (state.currentFilters.region !== "all") {
      filtered = filtered.filter(
        (s) => s.regionName === state.currentFilters.region
      );
    }
    filtered = filtered.filter(
      (s) => (s.ping || 0) <= state.animatedFilters.maxPing
    );

    const sorted = sortServers(filtered);
    ui.updateFilterStatus(sorted.length, state.allServers.length);
    ui.populateServerList(sorted, "all", state.currentPlaceIdForJoin);
    globe.updatePoints(filtered);
  }

  async function handleSearch() {
    const placeId = dom.placeIdInput.value.trim();
    if (!placeId || isNaN(placeId)) {
      ui.updateInitialStatus("Please enter a valid Place ID.", "error");
      gsap.fromTo(
        dom.placeIdInput,
        { x: -6 },
        {
          x: 6,
          duration: 0.05,
          repeat: 5,
          yoyo: true,
          clearProps: "x",
          ease: "power2.inOut",
        }
      );
      return;
    }

    state.setCurrentPlaceIdForJoin(placeId);
    dom.findServersBtn.disabled = true;
    ui.showLoader("Preparing scan...");
    ui.updateInitialStatus("Searching for servers...", "loading");
    ui.resetProgressBar();

    const settings = {
      serversToScan: state.advancedSettings.serversToScan,
      batchSize: state.advancedSettings.batchSize,
      delayBetweenGeolocationBatches:
        state.advancedSettings.delayBetweenGeolocationBatches,
    };

    api.searchServers(placeId, settings, {
      onProgress: ui.updateProgressBar,
      onComplete: (results) => {
        const finalGameDetails = { ...results.gameDetails };
        if (
          state.currentGameDetails &&
          state.currentGameDetails.placeId === placeId
        ) {
          finalGameDetails.thumbnailUrl = state.currentGameDetails.thumbnailUrl;
          finalGameDetails.visits = state.currentGameDetails.visits;
        }

        ui.populateGameInfo(finalGameDetails);
        state.setAllServers(results.servers);

        ui.setUIState("globe", () => {
          if (!isGlobeInitialized) {
            globe.init({
              onPointClick: handlePointClick,
              onGlobeClick: handleGlobeClick,
            });
            isGlobeInitialized = true;
          }
          globe.resize();
          ui.populateRegionFilter(results.servers);
          state.animatedFilters.maxPing = state.currentFilters.maxPing; // Reset animated filter
          applyFiltersAndRender();
          ui.switchTab("filters");
        });

        if (!results.servers || results.servers.length === 0) {
          dom.serverListTitle.textContent = "No Servers Found";
        }

        setTimeout(ui.hideLoader, 500);
        dom.findServersBtn.disabled = false;
      },
      onError: (message) => {
        ui.updateInitialStatus(`Error: ${message}`, "error");
        ui.setUIState("search");
        ui.updateProgressBar(0, `Scan failed: ${message.substring(0, 50)}...`);
        setTimeout(ui.hideLoader, 500);
        dom.findServersBtn.disabled = false;
      },
    });
  }

  async function handlePreviewInput() {
    clearTimeout(previewDebounceTimer);
    const placeId = dom.placeIdInput.value.trim();

    if (!placeId || isNaN(placeId) || placeId.length < 6) {
      state.setCurrentPreviewPlaceId(null);
      state.setCurrentGameDetails(null);
      await ui.hideGamePreview();
      return;
    }

    if (placeId === state.currentPreviewPlaceId) return;

    previewDebounceTimer = setTimeout(async () => {
      await ui.hideGamePreview();
      const data = await api.fetchGamePreview(placeId);
      if (data && dom.placeIdInput.value.trim() === placeId) {
        state.setCurrentPreviewPlaceId(placeId);
        data.placeId = placeId;
        state.setCurrentGameDetails(data);
        ui.showGamePreview(data);
      } else {
        state.setCurrentPreviewPlaceId(null);
        state.setCurrentGameDetails(null);
      }
    }, 400);
  }

  function handlePointClick(location) {
    const sorted = sortServers(location.servers);
    ui.populateServerList(sorted, "locationClick", state.currentPlaceIdForJoin);
    ui.switchTab("servers");
  }

  function handleGlobeClick() {
    applyFiltersAndRender();
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    dom.regionFilter.addEventListener("change", (e) => {
      state.currentFilters.region = e.target.value;
      applyFiltersAndRender();
    });

    dom.maxPingFilter.addEventListener("input", (e) => {
      dom.maxPingValue.textContent = e.target.value;
    });

    dom.maxPingFilter.addEventListener("change", (e) => {
      const targetPing = parseInt(e.target.value, 10);
      state.currentFilters.maxPing = targetPing;
      gsap.killTweensOf(state.animatedFilters);
      gsap.to(state.animatedFilters, {
        maxPing: targetPing,
        duration: 0.5,
        ease: "power2.out",
        onUpdate: applyFiltersAndRender,
      });
    });

    dom.sortBySelect.addEventListener("change", (e) => {
      state.currentSort.by = e.target.value;
      applyFiltersAndRender();
    });

    dom.sortOrderBtn.addEventListener("click", () => {
      state.currentSort.order =
        state.currentSort.order === "asc" ? "desc" : "asc";
      gsap.to(dom.sortOrderIcon, {
        rotationX: "+=180",
        duration: 0.4,
        ease: "power3.inOut",
      });
      dom.sortOrderBtn.title =
        state.currentSort.order === "asc"
          ? "Sort Ascending"
          : "Sort Descending";
      applyFiltersAndRender();
    });

    dom.toggleAdvancedSettings.addEventListener("click", () => {
      state.advancedSettings.isPanelOpen = !state.advancedSettings.isPanelOpen;
      if (state.advancedSettings.isPanelOpen) {
        gsap.to(dom.advancedSettingsPanel, {
          height: "auto",
          autoAlpha: 1,
          duration: 0.3,
          ease: "power2.out",
          onComplete: () =>
            (dom.advancedSettingsPanel.style.overflow = "visible"),
        });
      } else {
        dom.advancedSettingsPanel.style.overflow = "hidden";
        gsap.to(dom.advancedSettingsPanel, {
          height: 0,
          autoAlpha: 0,
          duration: 0.3,
          ease: "power2.in",
        });
      }
    });

    dom.findServersBtn.addEventListener("click", handleSearch);
    dom.placeIdInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter") handleSearch();
    });
    dom.placeIdInput.addEventListener("input", handlePreviewInput);

    dom.appTitleLink.addEventListener("click", () => {
      if (dom.mainView.style.opacity > 0) {
        ui.setUIState("search", () => {
          ui.updateInitialStatus("Enter a Place ID to begin.");
          ui.hideGamePreview();
          ui.clearServerListAndGameInfo();
          state.setCurrentGameDetails(null);
        });
        dom.placeIdInput.value = "";
      }
      ui.hideLoader();
    });

    dom.sidebarTabs.addEventListener("click", (e) => {
      const tabButton = e.target.closest(".sidebar-tab");
      if (tabButton) ui.switchTab(tabButton.dataset.tab);
    });

    document.addEventListener("click", function (event) {
      const button = event.target.closest(".join-button-list");
      if (button && !button.disabled) {
        const joinUrl = `roblox://experiences/start?placeId=${button.dataset.placeid}&gameInstanceId=${button.dataset.serverid}`;
        window.location.href = joinUrl;
      }
    });

    // Advanced settings persistence
    dom.serversToScanInput.value = state.advancedSettings.serversToScan;
    dom.serversToScanValue.textContent = state.advancedSettings.serversToScan;
    dom.batchSizeInput.value = state.advancedSettings.batchSize;
    dom.delayBetweenGeolocationBatchesInput.value =
      state.advancedSettings.delayBetweenGeolocationBatches;

    dom.serversToScanInput.addEventListener("input", (e) => {
      state.advancedSettings.serversToScan = parseInt(e.target.value, 10);
      dom.serversToScanValue.textContent = state.advancedSettings.serversToScan;
      state.saveAdvancedSettings();
    });
    dom.batchSizeInput.addEventListener("input", (e) => {
      state.advancedSettings.batchSize = parseInt(e.target.value, 10);
      state.saveAdvancedSettings();
    });
    dom.delayBetweenGeolocationBatchesInput.addEventListener("input", (e) => {
      state.advancedSettings.delayBetweenGeolocationBatches = parseInt(
        e.target.value,
        10
      );
      state.saveAdvancedSettings();
    });
  }
});

// Ad Banner Toggle Function
window.toggleAdBanner = function() {
  const adContainer = document.querySelector('.ad-container');
  const closeBtn = document.querySelector('.ad-close-btn');
  
  if (adContainer.classList.contains('minimized')) {
    adContainer.classList.remove('minimized');
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Minimize Ad';
  } else {
    adContainer.classList.add('minimized');
    closeBtn.innerHTML = '+';
    closeBtn.title = 'Restore Ad';
  }
};
