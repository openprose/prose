#!/usr/bin/env node
// =============================================================================
// record-demo.mjs — headless Playwright recorder for the Agent State Observatory
// launch demo (see planning/.../demo/MVC-PLAN.md §3 + §7).
//
// What it does, end to end, with NO manual steps:
//   1. SPAWNS the devtools server (dist/cli.js) as a managed child process
//      against fixtures/agent-observatory on a fixed port, waits for the port to
//      answer, and kills it at the end (no shell backgrounding).
//   2. Launches FULL Chromium (video-capable — not headless_shell) at 1280x720,
//      deviceScaleFactor 2, headless, with recordVideo → demo/recording/.
//   3. Drives the §3 beat timeline at 1x with generous pacing so every CSS pulse
//      fully plays. The MOVING flash/skip/edge pulses fire only on a forward
//      step, so the arc is driven by ArrowRight key presses (page.keyboard),
//      exactly like a human scrubbing ▶/→. Each beat is paced so the dark-lane,
//      the diamond single-wake, the red fail, and the cost spike are legible.
//   4. Captures a key-frame PNG at every §3 beat (cold-boot, quiet, self-tick,
//      HERO dark-lane, diamond, red-fail, recover, batch-spike, final-quiet),
//      named beat-NN-<name>.png, by PARKING on that beat's frame via the
//      `#frame=N` deep-link (idempotent state: hit/untouched/meter/caption).
//   5. Finalizes the .webm (context.close), then transcodes webm → mp4 via
//      ffmpeg for a Twitter-friendly artifact.
//
// Artifacts (LARGE binaries — gitignored working files for the user):
//   planning/plans/2026-05-31-reactor-devtools/demo/recording/
//     observatory-demo.webm   (raw Playwright capture)
//     observatory-demo.mp4     (ffmpeg transcode)
//     beat-01-cold-boot.png … beat-09-final-quiet.png
//
// Run from the package dir (or via `pnpm --filter @openprose/reactor-devtools record`):
//   node scripts/record-demo.mjs
// Optional env:
//   PORT=4571        fixed server port (default 4571)
//   KEEP_WEBM=1      keep the hashed source webm Playwright writes (default: rename)
//   SKIP_MP4=1       skip the ffmpeg transcode
// =============================================================================

import { spawn, execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const CLI_JS = join(PKG_DIR, "dist", "cli.js");

// ---------------------------------------------------------------------------
// Which fixture to record. Default = the agent-observatory (unchanged behavior,
// hardcoded BEATS below, artifacts → demo/recording/). Pass another fixture id
// via `FIXTURE=<id>` env or the first CLI argv to record a demo-suite scenario;
// then FIXTURE_DIR → fixtures/<id>, BEATS come from that dir's beats.json, and
// artifacts land in demo-suite/<id>/recording/.
//   FIXTURE=monorepo-ci node scripts/record-demo.mjs
//   node scripts/record-demo.mjs monorepo-ci
// ---------------------------------------------------------------------------
const FIXTURE_RAW = (process.env.FIXTURE || process.argv[2] || "").trim();
// "observatory" / "agent-observatory" / "" all mean the default observatory.
const IS_OBSERVATORY =
  FIXTURE_RAW === "" ||
  FIXTURE_RAW === "observatory" ||
  FIXTURE_RAW === "agent-observatory";
const FIXTURE_ID = IS_OBSERVATORY ? "agent-observatory" : FIXTURE_RAW;
const FIXTURE_DIR = join(PKG_DIR, "fixtures", FIXTURE_ID);
// Stable artifact base name (observatory keeps its historical name).
const ARTIFACT_BASE = IS_OBSERVATORY ? "observatory-demo" : `${FIXTURE_ID}-demo`;
const OUT_DIR = IS_OBSERVATORY
  ? resolve(
      REPO_ROOT,
      "..",
      "openprose",
      "planning",
      "plans",
      "2026-05-31-reactor-devtools",
      "demo",
      "recording",
    )
  : resolve(
      REPO_ROOT,
      "..",
      "openprose",
      "planning",
      "plans",
      "2026-05-31-reactor-devtools",
      "demo-suite",
      FIXTURE_ID,
      "recording",
    );

const PORT = Number(process.env.PORT || 4571);
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;
const FFMPEG = "/opt/homebrew/bin/ffmpeg";

// 1280x720 @ deviceScaleFactor 2 → 2560x1440 video, crisp for Twitter.
const VIEWPORT = { width: 1280, height: 720 };

// ---------------------------------------------------------------------------
// §3 beat timeline → frame indices in the committed agent-observatory dir
// (92 receipts, indices 0..91). Confirmed against the live --describe dump:
//   cold-boot cascade ~0..21 (clusterer #20 is only 4860 fresh) · quiet stretch
//   ~22..32 · self-tick #29/#30 (Concept Clusterer, self) · HERO Claude Adapter
//   rendered #35 · diamond #44 · red fail #53 · recover #56 ·
//   batch spike #73 (fresh 14580 — the lone tall tick) · final quiet → end (#91).
// `park` = the frame to deep-link + screenshot for that beat's still.
// `from`/`to` = the inclusive step range the recorder ArrowRight-drives so the
// moving pulses for that beat actually fire on camera.
// ---------------------------------------------------------------------------
const OBSERVATORY_BEATS = [
  // cold-boot: park at 21 (Agent Dashboard renders last) so the still shows the
  // WHOLE graph lit-floor once — the establishing "it lights up" shot.
  { name: "cold-boot", park: 21, from: 0, to: 21, holdMs: 2600, caption: "the graph lights up once" },
  // quiet: park at 32 so the cold-boot clusterer tick (#20, 4860) has fully
  // scrolled out of the 12-frame window — the meter + sparkline read genuinely
  // flat near zero (review #5).
  { name: "quiet", park: 32, from: 22, to: 32, holdMs: 2400, caption: "dim skip pulses · cost flat near zero" },
  // self-tick: a self-sourced skip on the Concept Clusterer (frames 29/30) — a
  // lone VIOLET self-pulse on the canvas, no edges lit, meter flat.
  { name: "self-tick", park: 30, from: 29, to: 30, holdMs: 2600, caption: "self-tick audit floor · a lone self-pulse, no edges, no cost" },
  // HERO: park on frame #39 (Agent Dashboard renders — the LAST frame of the
  // Claude-only drain). The steady-state lit-path overlay then holds the WHOLE
  // chain lit AT ONCE: Claude Adapter → Session Ledger → Session Summary[claudeA]
  // → Workstream Index → Dashboard, every connecting edge blazing orange, while
  // the 5 sibling adapter lanes + their edges stay genuinely DARK (review #1/#2).
  // The Dashboard head wears the bright `.rendered-now` glow; the rest of the path
  // wears `.path-node`; the caption is carried from the gateway's selective wake.
  { name: "hero-dark-lane", park: 39, from: 33, to: 39, holdMs: 3800, caption: "HERO: the whole Claude path lights · 5 sibling lanes stay dark" },
  // diamond: park on #48 (Workstream Index renders — the fan-in apex of the
  // claudeA+codexA drain). The lit-path overlay holds BOTH session lanes
  // (claudeA + codexA) converging into the index, lit, while claudeB stays dark;
  // the index is woken exactly once (the diamond single-wake reads as a fan-in).
  { name: "diamond", park: 48, from: 40, to: 48, holdMs: 3200, caption: "two summaries converge · the index is woken exactly once" },
  { name: "red-fail", park: 53, from: 51, to: 53, holdMs: 3000, caption: "Codex adapter fails RED · no downstream, prior truth stands" },
  // recover: frame 56 (Codex Adapter rendered, prior receipt failed) → the GREEN
  // recovery glow, the clear inverse of the red beat.
  { name: "recover", park: 56, from: 54, to: 56, holdMs: 2800, caption: "Codex recovers GREEN · its lane lights again" },
  // batch-spike: frame 73 (Concept Clusterer, fresh 14580) is the one tall tick
  // off the now-flat windowed sparkline (cold-boot's clusterer was only 4860 and
  // has long scrolled out of the 12-frame window).
  { name: "batch-spike", park: 73, from: 65, to: 74, holdMs: 3600, caption: "the expensive clusterer finally fires · one tall cost spike" },
  // final-quiet: park at 91 (the very end), where the batch spike has scrolled
  // fully out of the window → a genuinely flat bookend, the inverse of the spike.
  { name: "final-quiet", park: 91, from: 75, to: 91, holdMs: 2600, caption: "it goes quiet again · cost back to flat" },
];

// Resolve the beat timeline. The observatory uses its hardcoded BEATS above (so
// the default recording is byte-for-byte the same as today). Any other fixture
// reads its authored beats from `<FIXTURE_DIR>/beats.json` — the SAME file the
// SPA reads for its data-driven captions — so the recording and the live view
// narrate identically.
function resolveBeats() {
  if (IS_OBSERVATORY) return OBSERVATORY_BEATS;
  const beatsPath = join(FIXTURE_DIR, "beats.json");
  if (!existsSync(beatsPath)) {
    throw new Error(
      `fixture "${FIXTURE_ID}" has no beats.json at ${beatsPath} — ` +
        `regenerate the fixture (and copy its beats.json) first`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(beatsPath, "utf8"));
  } catch (e) {
    throw new Error(`could not parse ${beatsPath}: ${String(e?.message || e)}`);
  }
  const beats = Array.isArray(parsed?.beats) ? parsed.beats : null;
  if (!beats || beats.length === 0) {
    throw new Error(`${beatsPath} has no "beats" array`);
  }
  // Normalize each beat to the shape the driver below expects.
  return beats.map((b, i) => ({
    name: typeof b.name === "string" && b.name ? b.name : `beat-${i}`,
    park: Number(b.park),
    from: Number(typeof b.from === "number" ? b.from : b.park),
    to: Number(typeof b.to === "number" ? b.to : b.park),
    holdMs: Number(typeof b.holdMs === "number" ? b.holdMs : 2600),
    caption: typeof b.caption === "string" ? b.caption : "",
  }));
}

const BEATS = resolveBeats();

const log = (...a) => console.log("[record]", ...a);

// ---------------------------------------------------------------------------
// Resolve playwright (it's a devDependency of this package; pnpm hoists it under
// the package node_modules). Import from here so the module resolves regardless
// of cwd.
// ---------------------------------------------------------------------------
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    throw new Error(
      `could not import 'playwright' (devDependency). Run \`pnpm install\` in the workspace first. (${String(err)})`,
    );
  }
}

// Make sure the Chromium browser binary exists; install defensively if missing.
function ensureChromium(chromium) {
  let exe;
  try {
    exe = chromium.executablePath();
  } catch {
    exe = null;
  }
  if (exe && existsSync(exe)) {
    log("chromium present:", exe);
    return;
  }
  log("chromium missing — running `npx playwright install chromium` …");
  const r = spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: PKG_DIR,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    throw new Error("`npx playwright install chromium` failed");
  }
}

// Poll the server's /api/state until it answers (or time out).
async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/state`);
      if (res.ok) {
        const j = await res.json();
        return j;
      }
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error(`server did not answer ${BASE}/api/state within ${timeoutMs}ms`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Best-effort: kill any process currently listening on `port` so our managed
// server child can bind it cleanly (avoids filming a stale/phantom server).
function freePort(port) {
  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (!out) return;
    const pids = out.split(/\s+/).filter(Boolean);
    for (const pid of pids) {
      log(`freeing port ${port}: killing stale listener pid ${pid}`);
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  } catch {
    // lsof found nothing (non-zero exit) or is unavailable — port is likely free.
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(CLI_JS)) {
    throw new Error(`built CLI not found at ${CLI_JS} — run \`pnpm --filter @openprose/reactor-devtools build\` first`);
  }
  if (!existsSync(FIXTURE_DIR)) {
    throw new Error(`fixture state-dir not found at ${FIXTURE_DIR}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  // These are LARGE binary working artifacts for the user — keep them out of git
  // (mirrors demo/recording/.gitignore). Write a '*' .gitignore in the out dir.
  const gitignore = join(OUT_DIR, ".gitignore");
  if (!existsSync(gitignore)) writeFileSync(gitignore, "*\n", "utf8");
  log("output dir:", OUT_DIR);
  log("fixture:", FIXTURE_ID, "→", FIXTURE_DIR);

  const { chromium } = await loadPlaywright();
  ensureChromium(chromium);

  // --- 0. ensure the port is OURS ------------------------------------------
  // A stale server (e.g. a scouting run) on the same port would answer
  // /api/state and the recorder would film the WRONG process while our managed
  // child silently EADDRINUSE-dies. Free the port first, best-effort.
  freePort(PORT);

  // --- 1. spawn the managed server child -----------------------------------
  log(`spawning devtools server on ${BASE} …`);
  const server = spawn(
    process.execPath,
    [CLI_JS, FIXTURE_DIR, "--port", String(PORT), "--host", HOST],
    { cwd: PKG_DIR, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverDead = false;
  let serverExitCode = null;
  server.on("exit", (code) => {
    serverDead = true;
    serverExitCode = code;
    if (code && code !== 0 && code !== null) log(`server exited early with code ${code}`);
  });
  server.stdout?.on("data", (d) => process.stdout.write(`[server] ${d}`));
  server.stderr?.on("data", (d) => process.stderr.write(`[server] ${d}`));

  const killServer = () => {
    if (!serverDead && server.pid) {
      try {
        server.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  };
  process.on("exit", killServer);

  let browser;
  try {
    const snap = await waitForServer();
    // Guard against filming a phantom (pre-existing) server: if OUR child died
    // (e.g. EADDRINUSE) but the port still answered, that's someone else's
    // process — abort rather than record the wrong thing.
    if (serverDead) {
      throw new Error(
        `the managed server child exited (code ${serverExitCode}) yet ${BASE} still answered — ` +
          `a stale server is holding the port. Refusing to record a phantom process. ` +
          `Free port ${PORT} and retry.`,
      );
    }
    const N = snap.frames.length;
    log(`server up — ${N} frames / ${snap.nodes.length} nodes / ${snap.edges.length} edges`);

    // --- 2. launch full Chromium with video capture ------------------------
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      recordVideo: { dir: OUT_DIR, size: { width: VIEWPORT.width, height: VIEWPORT.height } },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => log("PAGE ERROR:", e.message));
    page.on("console", (m) => {
      if (m.type() === "error") log("console.error:", m.text());
    });

    // Open clean (index -1) and wait for the snapshot to load.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !!window.__REACTOR_SNAPSHOT__, { timeout: 15000 });
    await page.waitForSelector(".node", { timeout: 15000 });
    // Focus the body so global keydown handlers (Arrow steps) receive keys.
    await page.evaluate(() => document.body.focus());

    // Title card: sit on the clean (pre-cascade) world for a beat.
    log("beat 00 — clean world (title hold)");
    await page.waitForTimeout(2200);

    // --- 3 + 4. drive each beat, hold, screenshot -------------------------
    // The moving pulses fire on a forward step, so we ArrowRight-drive frame by
    // frame across each beat's range with per-step pacing, then PARK on the
    // beat's `park` frame (idempotent state) and capture the still.
    let cur = -1;
    const STEP_MS = 320; // per-frame cadence during the moving drive (1x feel)
    for (let b = 0; b < BEATS.length; b++) {
      const beat = BEATS[b];
      const tag = String(b + 1).padStart(2, "0");
      log(`beat ${tag} — ${beat.name}  (drive ${beat.from}..${beat.to})  ${beat.caption}`);

      // Drive forward into and across the beat range so the flash/skip/edge
      // pulses play on camera. If we somehow jumped past, hard-park instead.
      if (cur < beat.from - 1) {
        // fast-forward (still stepping, so pulses fire) up to just before the beat
        while (cur < beat.from - 1) {
          await page.keyboard.press("ArrowRight");
          cur++;
          await page.waitForTimeout(120);
        }
      } else if (cur > beat.from - 1) {
        // we're ahead — park via deep link (no backward pulses needed)
        await parkOnFrame(page, beat.from - 1);
        cur = beat.from - 1;
      }
      // Step across the beat at full cadence (pulses fire here).
      for (let f = beat.from; f <= beat.to; f++) {
        await page.keyboard.press("ArrowRight");
        cur = f;
        await page.waitForTimeout(STEP_MS);
      }

      // Hold on the beat so the viewer reads it.
      await page.waitForTimeout(beat.holdMs);

      // Park on the canonical still frame for a clean idempotent screenshot,
      // then grab the keyframe PNG.
      if (cur !== beat.park) {
        await parkOnFrame(page, beat.park);
        cur = beat.park;
        await page.waitForTimeout(700);
      }
      const png = join(OUT_DIR, `beat-${tag}-${beat.name}.png`);
      await page.screenshot({ path: png });
      log(`  ✓ keyframe → ${png}`);
    }

    // Tail hold on the final-quiet state, then finalize.
    await page.waitForTimeout(1800);

    // --- 5. finalize the webm ---------------------------------------------
    const video = page.video();
    await context.close(); // finalizes the recordVideo file
    await browser.close();
    browser = undefined;

    let webmPath = video ? await video.path() : null;
    if (!webmPath) {
      // Fallback: find the newest .webm in OUT_DIR
      webmPath = newestWebm(OUT_DIR);
    }
    if (!webmPath || !existsSync(webmPath)) {
      throw new Error("Playwright did not produce a .webm video file");
    }
    const size = statSync(webmPath).size;
    log(`webm written: ${webmPath} (${(size / 1024).toFixed(0)} KiB)`);
    if (size < 50 * 1024) {
      throw new Error(`webm is suspiciously small (${size} bytes) — recording likely failed`);
    }

    // Rename the hashed Playwright file to a stable name unless KEEP_WEBM=1.
    let finalWebm = webmPath;
    if (!process.env.KEEP_WEBM) {
      finalWebm = join(OUT_DIR, `${ARTIFACT_BASE}.webm`);
      if (finalWebm !== webmPath) {
        if (existsSync(finalWebm)) rmSync(finalWebm);
        renameSync(webmPath, finalWebm);
        log(`renamed webm → ${finalWebm}`);
      }
    }

    // --- ffmpeg → mp4 ------------------------------------------------------
    let mp4Path = null;
    if (!process.env.SKIP_MP4 && existsSync(FFMPEG)) {
      mp4Path = join(OUT_DIR, `${ARTIFACT_BASE}.mp4`);
      log(`transcoding → ${mp4Path} …`);
      try {
        execFileSync(
          FFMPEG,
          [
            "-y",
            "-i",
            finalWebm,
            "-movflags",
            "+faststart",
            "-pix_fmt",
            "yuv420p",
            mp4Path,
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        log(`mp4 written: ${mp4Path} (${(statSync(mp4Path).size / 1024).toFixed(0)} KiB)`);
      } catch (e) {
        log("ffmpeg transcode failed (webm still produced):", String(e?.message || e));
        mp4Path = null;
      }
    } else if (!existsSync(FFMPEG)) {
      log(`ffmpeg not found at ${FFMPEG} — skipping mp4 (webm is the deliverable)`);
    }

    // Summary
    const pngs = readdirSync(OUT_DIR)
      .filter((f) => f.startsWith("beat-") && f.endsWith(".png"))
      .sort()
      .map((f) => join(OUT_DIR, f));
    log("DONE.");
    log("  webm:", finalWebm);
    log("  mp4:", mp4Path || "(none)");
    log(`  keyframes (${pngs.length}):`);
    for (const p of pngs) log("    " + p);

    // Machine-readable last line for the harness/orchestrator.
    console.log(
      "RESULT " +
        JSON.stringify({
          ok: true,
          webm: finalWebm,
          mp4: mp4Path,
          keyframes: pngs,
          frames: N,
        }),
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    killServer();
  }
}

// Park on a specific frame via the #frame=N deep-link (idempotent state).
async function parkOnFrame(page, frame) {
  await page.evaluate((n) => {
    window.location.hash = `frame=${n}`;
  }, frame);
  // hashchange handler calls pause()+applyIndex; give it a tick.
  await page.waitForTimeout(220);
}

function newestWebm(dir) {
  const webms = readdirSync(dir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return webms[0] || null;
}

main().catch((err) => {
  console.error("[record] FATAL:", err?.stack || String(err));
  console.log("RESULT " + JSON.stringify({ ok: false, error: String(err?.message || err) }));
  process.exit(1);
});
