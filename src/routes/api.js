// 📁 src/routes/api.js

import express from "express";
import geoip from "geoip-lite";
import boxen from "boxen";
import chalk from "chalk";
import { ROBLOX_COOKIE } from "../config/index.js";
import * as robloxService from "../services/roblox.js";

const router = express.Router();

router.get("/game-preview/:placeId", async (req, res) => {
  const placeId = parseInt(req.params.placeId, 10);

  if (isNaN(placeId) || placeId <= 0) {
    return res.status(400).json({ message: "Invalid PlaceID format" });
  }

  try {
    const previewData = await robloxService.getGamePreview(placeId);
    if (previewData) {
      res.status(200).json(previewData);
    } else {
      res.status(404).json({ message: "Game not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/server-regions/:placeId", async (req, res) => {
  const startTime = Date.now();
  const placeId = parseInt(req.params.placeId, 10);

  const serversToScan = Math.min(
    300,
    parseInt(req.query.serversToScan, 10) || 100
  );
  const batchSize = parseInt(req.query.batchSize, 10) || 5;
  const delayBetweenGeolocationBatches =
    parseInt(req.query.delayBetweenGeolocationBatches, 10) || 500;
  const robloxApiPageLimit = 100;

  const userIp = req.ip;
  const geo = geoip.lookup(userIp);
  const userGeo = geo
    ? { lat: geo.ll[0], lon: geo.ll[1] }
    : { lat: 41.05, lon: 29.04 };

  const requestTitle = `Request for PlaceID: ${placeId} from ${userIp} (${
    geo ? geo.city : "Local"
  })\nServers: ${serversToScan}, Batch: ${batchSize}, Delay: ${delayBetweenGeolocationBatches}ms`;
  console.log(
    boxen(chalk.cyan.bold(requestTitle), {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "cyan",
    })
  );

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let actualServersFetched = 0;
  const sendProgress = (
    current_item,
    total_items,
    message,
    phase_overall_weight,
    total_overall_servers_fetched_val = 0
  ) => {
    actualServersFetched =
      total_overall_servers_fetched_val || actualServersFetched;
    let overallProgress = 0;
    const phase1Weight = 0.2,
      phase2Weight = 0.8;

    if (phase_overall_weight === phase1Weight) {
      overallProgress = (current_item / total_items) * phase1Weight;
    } else {
      const totalForPhase2 = total_items > 0 ? total_items : 1;
      overallProgress =
        phase1Weight + (current_item / totalForPhase2) * phase2Weight;
    }

    overallProgress = Math.max(0, Math.min(1, overallProgress));
    sendEvent("message", {
      type: "progress",
      progress: overallProgress,
      message: message,
    });
  };

  if (isNaN(placeId)) {
    sendEvent("message", { type: "error", message: "Invalid PlaceID" });
    res.end();
    return;
  }

  try {
    sendProgress(0, 1, "Fetching game details...", 0.2);
    const gameDetails = await robloxService.getGameDetails(placeId);

    const robloxServers = await robloxService.getPublicServers(
      placeId,
      serversToScan,
      robloxApiPageLimit,
      sendProgress
    );
    actualServersFetched = robloxServers.length;

    if (robloxServers.length === 0) {
      sendProgress(1, 1, "Scan complete: No public servers found.", 0.8, 1);
      sendEvent("message", {
        type: "complete",
        results: { gameDetails: gameDetails || {}, servers: [] },
      });
      res.end();
      return;
    }

    console.log(
      chalk.blue.bold(
        `\n[GEO] Geolocating ${robloxServers.length} servers (Batch Size: ${batchSize}, Delay: ${delayBetweenGeolocationBatches}ms)...`
      )
    );
    const locatedServers = [];
    let successCount = 0,
      failCount = 0;

    for (let i = 0; i < robloxServers.length; i += batchSize) {
      const batch = robloxServers.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      console.log(
        chalk.blue(
          `\n[GEO] ⌛ Processing batch #${batchNumber} (servers ${
            i + 1
          }-${Math.min(i + batchSize, robloxServers.length)})`
        )
      );

      const geoPromises = batch.map((server) =>
        robloxService.getServerGeoLocation(
          server,
          placeId,
          ROBLOX_COOKIE,
          userGeo
        )
      );
      const results = await Promise.allSettled(geoPromises);

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          locatedServers.push(result.value);
          successCount++;
        } else {
          failCount++;
        }
      });

      sendProgress(
        locatedServers.length,
        actualServersFetched,
        `Geolocating servers (${locatedServers.length}/${actualServersFetched})...`,
        0.8
      );

      if (i + batchSize < robloxServers.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenGeolocationBatches)
        );
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const summary = `${chalk.green.bold(
      "✓ Request Completed"
    )}\n\n${chalk.white("Duration:")} ${chalk.yellow(
      `${duration}s`
    )}\n${chalk.white("Servers Found:")} ${chalk.cyan(
      actualServersFetched
    )}\n${chalk.white("Located:")} ${chalk.green(successCount)}\n${chalk.white(
      "Failed:"
    )} ${chalk.red(failCount)}`;
    console.log(
      boxen(summary, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "green",
      })
    );

    sendProgress(
      actualServersFetched,
      actualServersFetched,
      "Scan complete!",
      0.8
    );
    sendEvent("message", {
      type: "complete",
      results: { gameDetails: gameDetails || {}, servers: locatedServers },
    });
    res.end();
  } catch (error) {
    console.error(
      chalk.red.bold(`[CRITICAL] ✗ Critical error for PlaceID ${placeId}:`),
      error
    );
    sendEvent("message", {
      type: "error",
      message:
        error.response?.data?.errors?.[0]?.message ||
        error.message ||
        "Internal server error",
    });
    res.end();
  }
});

export default router;
