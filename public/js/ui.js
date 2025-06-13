// 📁 public/js/ui.js

import * as dom from "./dom.js";
import * as state from "./state.js";

// --- Page Load & Transitions ---
export function runIntroAnimation() {
  gsap.set(dom.appHeader, { y: -50, autoAlpha: 0 });
  gsap.set(dom.initialView, { y: 30, autoAlpha: 0 });
  gsap.set(dom.mainView, { display: "none", autoAlpha: 0 });
  gsap.set(dom.gamePreviewPanel, { autoAlpha: 0, y: 20 });
  gsap.set(dom.advancedSettingsPanel, {
    height: 0,
    autoAlpha: 0,
    overflow: "hidden",
  });

  const tlIntro = gsap.timeline({ defaults: { ease: "power2.out" } });
  tlIntro
    .to(dom.appHeader, { y: 0, autoAlpha: 1, duration: 0.6 })
    .to(dom.initialView, { y: 0, autoAlpha: 1, duration: 0.8 }, "<0.2");
}

export function setUIState(stateName, onComplete) {
  const tl = gsap.timeline({ onComplete });
  if (stateName === "globe") {
    tl.to(dom.initialView, {
      autoAlpha: 0,
      y: -30,
      scale: 0.95,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => (dom.initialView.style.display = "none"),
    })
      .set(dom.mainView, { display: "flex", autoAlpha: 0, y: 30, scale: 0.95 })
      .to(dom.mainView, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: "power2.out",
      });
  } else {
    // 'search' state
    tl.to(dom.mainView, {
      autoAlpha: 0,
      y: 30,
      duration: 0.4,
      ease: "power2.in",
      onComplete: () => (dom.mainView.style.display = "none"),
    })
      .set(dom.initialView, {
        display: "flex",
        autoAlpha: 0,
        y: -30,
        scale: 0.95,
      })
      .to(dom.initialView, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: "power2.out",
      });
  }
}

// --- Loader & Progress Bar ---
export function showLoader(message = "Loading...") {
  gsap.to(dom.loaderOverlay, {
    autoAlpha: 1,
    duration: 0.25,
    ease: "power1.out",
  });
  gsap.to(dom.progressBar.parentElement, {
    autoAlpha: 1,
    duration: 0.25,
    ease: "power1.out",
  });
  dom.loaderMessage.textContent = message;
}

export function hideLoader() {
  gsap.to(dom.loaderOverlay, {
    autoAlpha: 0,
    duration: 0.3,
    ease: "power1.in",
  });
  gsap.to(dom.progressBar.parentElement, {
    autoAlpha: 0,
    duration: 0.3,
    ease: "power1.in",
  });
}

export function updateProgressBar(progress, message = "Loading...") {
  progress = Math.max(0, Math.min(1, progress));
  const percentage = Math.round(progress * 100);

  gsap.to(dom.progressBar, {
    width: `${percentage}%`,
    duration: 0.2,
    ease: "power1.out",
  });
  dom.progressText.textContent = `${percentage}%`;
  dom.loaderMessage.textContent = message;

  if (percentage > 0 && percentage < 100) {
    gsap.to(dom.progressText, {
      color: "var(--text-highlight)",
      duration: 0.2,
    });
    gsap.to(dom.progressBar, {
      backgroundColor: "var(--accent-primary)",
      duration: 0.2,
    });
  } else if (percentage === 100) {
    gsap.to(dom.progressText, {
      color: "var(--accent-success)",
      duration: 0.2,
    });
    gsap.to(dom.progressBar, {
      backgroundColor: "var(--accent-success)",
      duration: 0.2,
    });
  } else {
    gsap.to(dom.progressText, {
      color: "var(--text-highlight)",
      duration: 0.2,
    });
    gsap.to(dom.progressBar, {
      backgroundColor: "var(--accent-primary)",
      duration: 0.2,
    });
  }
}

export function resetProgressBar() {
  dom.progressBar.style.width = "0%";
  dom.progressText.textContent = "0%";
  dom.progressText.style.color = "var(--text-highlight)";
  dom.progressBar.style.backgroundColor = "var(--accent-primary)";
}

// --- Component Population & Updates ---
export function populateServerList(servers, context = "all", placeId) {
  dom.serverListContent.innerHTML = "";

  if (!servers || servers.length === 0) {
    let message = "No servers match the current filters.";
    if (context === "locationClick") {
      message = `No servers found in this specific location.`;
    }
    dom.serverListContent.innerHTML = `<p class="${dom.serverListPlaceholderClass}">${message}</p>`;
    dom.serverListTitle.textContent = "Server List";
    return;
  }

  let titleText = `Filtered Servers (${servers.length})`;
  if (context === "locationClick") {
    titleText =
      servers.length > 1
        ? `Servers in ${servers[0].city}, ${servers[0].country} (${servers.length})`
        : `Server: ${servers[0].city || "Unknown Location"}, ${
            servers[0].country || "Null City"
          }`;
  }
  dom.serverListTitle.textContent = titleText;

  servers.forEach((server, index) => {
    const isFull = server.playing === server.maxPlayers;
    const playerCountStr =
      typeof server.playing === "number" &&
      typeof server.maxPlayers === "number"
        ? `${server.playing}/${server.maxPlayers}`
        : "N/A";

    const locationString = [server.city, server.regionName, server.countryCode]
      .filter(Boolean)
      .join(", ");

    const itemDiv = document.createElement("div");
    itemDiv.className = "server-item";
    itemDiv.innerHTML = `
            <div class="server-item-details">
                ${
                  context === "locationClick" && servers.length > 1
                    ? `<strong class="highlight">Server ${
                        index + 1
                      }</strong><br>`
                    : ""
                }
                <span class="detail-label">Location:</span> <span>${
                  locationString || "N/A"
                }</span><br>
                <span class="detail-label">Players:</span> <span>${playerCountStr}</span><br>
                <span class="detail-label">Ping:</span> <span>${
                  server.ping || "N/A"
                }ms</span><br>
                <span class="detail-label">Server ID:</span> <span>${
                  server.id || "N/A"
                }</span>
            </div>
            <button class="join-button-list" data-placeid="${placeId}" data-serverid="${
      server.id
    }" ${isFull ? "disabled" : ""}>${isFull ? "Full" : "Join"}</button>
        `;
    dom.serverListContent.appendChild(itemDiv);
  });

  const serverItems = dom.serverListContent.querySelectorAll(".server-item");
  if (serverItems.length > 0) {
    gsap.from(serverItems, {
      duration: 0.4,
      opacity: 0,
      y: 15,
      stagger: 0.05,
      ease: "power2.out",
    });
  }
}

export function populateGameInfo(details) {
  if (details && details.name) {
    dom.gameInfoName.textContent = details.name ?? "N/A";
    dom.gameInfoPlaying.textContent =
      details.playing?.toLocaleString() ?? "N/A";
    dom.gameInfoVisits.textContent = details.visits?.toLocaleString() ?? "N/A";

    dom.gameInfoThumbnail.className = "";
    dom.gameInfoThumbnail.src = "";

    if (details.thumbnailUrl) {
      const img = new Image();
      img.onload = () => {
        dom.gameInfoThumbnail.src = img.src;
        dom.gameInfoThumbnail.classList.add("loaded");
      };
      img.onerror = () => dom.gameInfoThumbnail.classList.add("loaded");
      img.src = details.thumbnailUrl;
    } else {
      dom.gameInfoThumbnail.classList.add("loaded");
    }
  } else {
    dom.gameInfoName.textContent = "Game Details Not Available";
    dom.gameInfoPlaying.textContent = "N/A";
    dom.gameInfoVisits.textContent = "N/A";
  }
}

export function populateRegionFilter(servers) {
  const regions = [
    ...new Set(servers.map((s) => s.regionName).filter(Boolean)),
  ];
  regions.sort();
  dom.regionFilter.innerHTML = '<option value="all">All Regions</option>';
  regions.forEach((region) => {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    dom.regionFilter.appendChild(option);
  });
}

export function showGamePreview(data) {
  dom.gamePreviewName.textContent = data.name;
  dom.gamePreviewPlaying.textContent = data.playing?.toLocaleString() ?? "N/A";
  dom.gamePreviewVisits.textContent = data.visits?.toLocaleString() ?? "N/A";

  dom.gamePreviewThumbnail.className = "";
  dom.gamePreviewThumbnail.src = "";

  if (data.thumbnailUrl) {
    const img = new Image();
    img.onload = () => {
      if (state.currentPreviewPlaceId === data.placeId) {
        dom.gamePreviewThumbnail.src = img.src;
        dom.gamePreviewThumbnail.classList.add("loaded");
      }
    };
    img.onerror = () => {
      if (state.currentPreviewPlaceId === data.placeId) {
        dom.gamePreviewThumbnail.classList.add("loaded");
      }
    };
    img.src = data.thumbnailUrl;
  } else {
    dom.gamePreviewThumbnail.classList.add("loaded");
  }

  gsap.to(dom.gamePreviewPanel, {
    autoAlpha: 1,
    y: 0,
    duration: 0.4,
    ease: "power2.out",
  });
}

export function hideGamePreview() {
  return new Promise((resolve) => {
    if (gsap.getProperty(dom.gamePreviewPanel, "autoAlpha") === 0) {
      resolve();
      return;
    }
    gsap.to(dom.gamePreviewPanel, {
      autoAlpha: 0,
      y: 20,
      duration: 0.3,
      ease: "power2.in",
      onComplete: resolve,
    });
  });
}

export function clearServerListAndGameInfo() {
  dom.serverListContent.innerHTML = `<p class="${dom.serverListPlaceholderClass}">Click a server on the globe.</p>`;
  dom.serverListTitle.textContent = "Server Details";
  dom.gameInfoName.textContent = "Game Name";
  dom.gameInfoPlaying.textContent = "N/A";
  dom.gameInfoVisits.textContent = "N/A";
  dom.gameInfoThumbnail.src = "";
  dom.gameInfoThumbnail.className = "";
  state.setAllServers([]);
}

export function updateInitialStatus(message, type = "default") {
  dom.initialStatusMessage.textContent = message;
  dom.initialStatusMessage.className = "status-message";
  if (type !== "default") dom.initialStatusMessage.classList.add(type);
}

export function switchTab(tabName) {
  dom.sidebarTabs.querySelectorAll(".sidebar-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
  dom.tabPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.dataset.tabContent === tabName);
  });
}

export function updateFilterStatus(filteredCount, totalCount) {
  dom.filterStatusMessage.textContent = `Showing ${filteredCount} of ${totalCount} servers.`;
}
