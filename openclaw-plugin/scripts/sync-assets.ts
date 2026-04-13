#!/usr/bin/env bun
/**
 * Sync vendored OpenProse assets from the canonical skill tree.
 *
 * Copies prose/skills/open-prose/ → openclaw-plugin/assets/openprose/
 * so the plugin package ships a pinned version of the spec files.
 *
 * Run: bun run scripts/sync-assets.ts
 */

import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const SCRIPT_DIR = import.meta.dirname ?? resolve(import.meta.url.replace("file://", ""), "..");
const PLUGIN_ROOT = resolve(SCRIPT_DIR, "..");
const SKILL_SOURCE = resolve(PLUGIN_ROOT, "..", "skills", "open-prose");
const ASSETS_DEST = resolve(PLUGIN_ROOT, "assets", "openprose");

if (!existsSync(SKILL_SOURCE)) {
  console.error(`Source not found: ${SKILL_SOURCE}`);
  console.error("Run this script from the openclaw-plugin/ directory within the prose repo.");
  process.exit(1);
}

// Clean destination
if (existsSync(ASSETS_DEST)) {
  rmSync(ASSETS_DEST, { recursive: true });
}
mkdirSync(ASSETS_DEST, { recursive: true });

// Copy the full skill tree
cpSync(SKILL_SOURCE, ASSETS_DEST, { recursive: true });

console.log(`Synced: ${SKILL_SOURCE}`);
console.log(`    →   ${ASSETS_DEST}`);

// Verify key files exist
const required = ["SKILL.md", "prose.md", "forme.md", "help.md"];
const missing = required.filter((f) => !existsSync(join(ASSETS_DEST, f)));
if (missing.length > 0) {
  console.error(`WARNING: Missing expected files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Asset sync complete.");
