// 📁 public/js/api.js

const API_BASE_URL = "";
let previewRequestController = null;

export async function fetchGamePreview(placeId) {
  if (previewRequestController) {
    previewRequestController.abort();
  }
  previewRequestController = new AbortController();

  try {
    const res = await fetch(`${API_BASE_URL}/api/game-preview/${placeId}`, {
      signal: previewRequestController.signal,
    });
    if (!res.ok) throw new Error("Game not found");
    return await res.json();
  } catch (err) {
    if (err.name !== "AbortError") {
      console.log(`Preview fetch failed for ${placeId}:`, err.message);
    }
    return null;
  }
}

export function searchServers(placeId, settings, callbacks) {
  const { onProgress, onComplete, onError } = callbacks;
  const queryParams = new URLSearchParams(settings).toString();
  const eventSource = new EventSource(
    `${API_BASE_URL}/api/server-regions/${placeId}?${queryParams}`
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "progress") {
      if (onProgress) onProgress(data.progress, data.message);
    } else if (data.type === "complete") {
      eventSource.close();
      if (onComplete) onComplete(data.results);
    } else if (data.type === "error") {
      eventSource.close();
      if (onError) onError(data.message);
    }
  };

  eventSource.onerror = (err) => {
    eventSource.close();
    if (
      err.eventPhase !== EventSource.CLOSED &&
      err.currentTarget.readyState !== EventSource.CLOSED
    ) {
      if (onError) onError("Network error or server disconnected.");
    }
  };
}
