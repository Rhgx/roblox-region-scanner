// 📁 public/js/globe.js

import * as dom from "./dom.js";

let globe;
let isGlobeFocused = false;
let autoRotateTimeout;
let isAutoRotating = false;
let animationFrameId;

let onPointClickHandler;
let onGlobeClickHandler;

function stopAutoRotation() {
  clearTimeout(autoRotateTimeout);
  if (isAutoRotating) {
    cancelAnimationFrame(animationFrameId);
    isAutoRotating = false;
  }
}

function startAutoRotation() {
  if (isAutoRotating || isGlobeFocused) return;
  isAutoRotating = true;

  const rotate = () => {
    const currentPov = globe.pointOfView();
    const newPov = { ...currentPov, lng: (currentPov.lng || 0) + 0.05 };
    globe.pointOfView(newPov, 0);
    animationFrameId = requestAnimationFrame(rotate);
  };
  rotate();
}

function resetAutoRotateTimer() {
  stopAutoRotation();
  if (!isGlobeFocused) {
    autoRotateTimeout = setTimeout(startAutoRotation, 5000);
  }
}

function handleGlobeInteraction() {
  stopAutoRotation();
  resetAutoRotateTimer();
}

export function init(options) {
  onPointClickHandler = options.onPointClick;
  onGlobeClickHandler = options.onGlobeClick;

  globe = Globe()(dom.globeElement)
    .globeImageUrl("assets/equirectangular-projection-test.png")
    .bumpImageUrl("")
    .backgroundImageUrl("/assets/background.png")
    .backgroundColor("rgba(13, 17, 23, 1)")
    .showAtmosphere(true)
    .atmosphereColor("#58a6ff")
    .atmosphereAltitude(0.25)
    .pointsData([])
    .pointLat("lat")
    .pointLng("lon")
    .pointColor(() => "rgba(0,0,0,0)")
    .pointAltitude(0.01)
    .pointRadius(1.2)
    .pointLabel(
      (p) =>
        `<b>${p.servers[0].city}, ${p.servers[0].country}</b> (${
          p.servers.length
        } server${p.servers.length > 1 ? "s" : ""})`
    )
    .onPointClick((location) => {
      isGlobeFocused = true;
      stopAutoRotation();
      if (onPointClickHandler) onPointClickHandler(location);
      globe.pointOfView(
        { lat: location.lat, lng: location.lon, altitude: 1.5 },
        700
      );
    })
    .htmlElementsData([])
    .htmlLat("lat")
    .htmlLng("lon")
    .htmlElement(() => {
      const el = document.createElement("div");
      el.innerHTML = `<div class="globe-ping"><div class="dot"></div><div class="pulse"></div></div>`;
      return el;
    })
    .onGlobeClick(() => {
      isGlobeFocused = false;
      resetAutoRotateTimer();
      if (onGlobeClickHandler) onGlobeClickHandler();
    });

  const globeCanvas = dom.globeElement.querySelector("canvas");
  if (globeCanvas) {
    globeCanvas.addEventListener("mousedown", handleGlobeInteraction);
    globeCanvas.addEventListener("touchstart", handleGlobeInteraction, {
      passive: true,
    });
    globeCanvas.addEventListener("wheel", handleGlobeInteraction, {
      passive: true,
    });
  }

  window.addEventListener("resize", resize);
  resize(); // Initial resize
  resetAutoRotateTimer();
}

export function updatePoints(servers) {
  if (!globe) return;
  const locations = new Map();
  servers.forEach((server) => {
    const key = `${server.lat},${server.lon}`;
    if (!locations.has(key)) {
      locations.set(key, { lat: server.lat, lon: server.lon, servers: [] });
    }
    locations.get(key).servers.push(server);
  });
  const compiledData = Array.from(locations.values());
  globe.pointsData(compiledData).htmlElementsData(compiledData);
}

export function resize() {
  if (globe && dom.globeElement.parentElement.offsetWidth > 0) {
    globe.width(dom.globeElement.parentElement.offsetWidth);
    globe.height(dom.globeElement.parentElement.offsetHeight);
  }
}
