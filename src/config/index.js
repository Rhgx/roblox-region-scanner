// src/config/index.js

import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
// Note: We go up one level because this file is in a subdirectory
const __dirname = path.dirname(path.dirname(__filename));

export const PORT = process.env.PORT || 3000;
export let ROBLOX_COOKIE;

try {
  // Try to get ROBLOX_COOKIE from .env first
  if (process.env.ROBLOX_COOKIE) {
    ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
    console.log(
      chalk.green.bold("✓ Config loaded successfully from .env file")
    );
  } else {
    // Fall back to config.json if .env doesn't have the cookie
    const configPath = path.join(__dirname, "config.json");
    const configFile = await fs.readFile(configPath, "utf8");
    const CONFIG = JSON.parse(configFile);

    if (!CONFIG.robloxCookie) {
      throw new Error(
        "'robloxCookie' is missing in config.json and ROBLOX_COOKIE is not set in .env"
      );
    }

    ROBLOX_COOKIE = CONFIG.robloxCookie;
    console.log(
      chalk.green.bold("✓ Config loaded successfully from config.json")
    );
  }
} catch (error) {
  console.error(
    chalk.red.bold("✗ Error loading config:"),
    chalk.yellow(error.message)
  );
  console.log(
    chalk.yellow(
      "ℹ Please ensure .env file with ROBLOX_COOKIE or a config.json file exists at the project root."
    )
  );
  process.exit(1);
}
