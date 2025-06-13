// src/app.js

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import boxen from "boxen";
import chalk from "chalk";

import { PORT } from "./config/index.js"; // Import config
import apiRoutes from "./routes/api.js"; // Import routes

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());
// Trust the first proxy to get the real user IP
app.set("trust proxy", 1);
// Serve static files from the 'public' directory at the project root
app.use(express.static(path.join(__dirname, "..", "public")));

// --- Mount Routes ---
// All routes from api.js will be prefixed with /api
app.use("/api", apiRoutes);

// --- Server Start ---
app.listen(PORT, () => {
  const title = chalk.greenBright.bold("Roblox Region Scanner");
  const details = [
    `${chalk.white("Server is running on")} ${chalk.cyan(
      `http://localhost:${PORT}`
    )}`,
    `${chalk.white("Frontend accessible at")} ${chalk.cyan(
      `http://localhost:${PORT}/`
    )}`,
  ].join("\n");

  console.log(
    boxen(`${title}\n\n${details}`, {
      padding: 1,
      margin: 1,
      borderStyle: "classic",
      borderColor: "greenBright",
      titleAlignment: "center",
      textAlignment: "center",
    })
  );
});
