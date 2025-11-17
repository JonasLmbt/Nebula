// src/config/env.ts
// Centralised environment / configuration loader.

import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

export const NODE_ENV = process.env.NODE_ENV || "production";
export const IS_DEV =
  NODE_ENV === "development" ||
  process.env.ELECTRON_ENV === "development";

export const NEBULA_API_BASE =
  process.env.NEBULA_API_BASE || "https://nebula-overlay.online";

export const HYPIXEL_API_KEY = process.env.HYPIXEL_API_KEY || "";
export const BACKEND_API_URL = process.env.BACKEND_API_URL || "";

/**
 * Resolve absolute path to the renderer folder.
 * Assumes compiled JS is in dist/src and renderer is in dist/renderer.
 * If du anders baust, kannst du diesen Pfad anpassen.
 */
export function getRendererDir(): string {
  // __dirname = dist/src/config im Build
  return path.resolve(__dirname, "..", "..", "renderer");
}

/**
 * Resolve path to index.html.
 */
export function getIndexHtmlPath(): string {
  return path.join(getRendererDir(), "index.html");
}

/**
 * Resolve path to preload.js.
 */
export function getPreloadPath(): string {
  return path.join(getRendererDir(), "preload.js");
}
