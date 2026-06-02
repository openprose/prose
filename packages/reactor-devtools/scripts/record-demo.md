# Recording the Agent State Observatory demo

`scripts/record-demo.mjs` records the launch demo end-to-end with **no manual
steps**: it spawns the devtools server, drives the SPA through the §3 beat
timeline in headless Chromium, and writes a video + per-beat key-frame PNGs.

## One command

```bash
# from the package dir
pnpm --filter @openprose/reactor-devtools record
# or directly (assumes the package is already built):
node packages/reactor-devtools/scripts/record-demo.mjs
```

`pnpm run record` runs `pnpm build` first; the bare `node …` form needs
`dist/cli.js` to already exist (`pnpm --filter @openprose/reactor-devtools build`).

## What it does

1. **Frees the port**, then **spawns** `dist/cli.js fixtures/agent-observatory`
   as a managed child on a fixed port (default `4571`), waits for `/api/state`
   to answer, and **kills it at the end**. If a stale server already holds the
   port and answers, the script aborts rather than film a phantom process.
2. Launches **full Chromium** (video-capable, headless) at **1280×720**,
   `deviceScaleFactor 2`, with `recordVideo` → the output dir.
3. Drives the **§3 beats** in order by stepping frames (ArrowRight) at ~1×, so
   every CSS flash / skip / edge pulse fully plays. Beats and their frames:

   | # | beat | frames driven | still parked at |
   |---|------|---------------|-----------------|
   | 1 | cold-boot | 0–8 | 8 |
   | 2 | quiet | 9–28 | 22 |
   | 3 | self-tick | 29–30 | 30 |
   | 4 | **HERO dark-lane** | 31–34 | **34** |
   | 5 | diamond | 35–44 | 44 |
   | 6 | red-fail | 45–53 | 53 |
   | 7 | recover | 54–56 | 56 |
   | 8 | batch-spike | 57–67 | **67** |
   | 9 | final-quiet | 68–73 | 73 |

4. Captures a **key-frame PNG per beat** (`beat-NN-<name>.png`) by parking on the
   beat's frame via the `#frame=N` deep-link and screenshotting the idempotent
   state (hit/untouched nodes, cost meter, hero caption).
5. Finalizes the `.webm`, then transcodes **webm → mp4** with ffmpeg
   (`/opt/homebrew/bin/ffmpeg`, `+faststart`, `yuv420p` — Twitter-friendly).

## Outputs

All land in (gitignored — large working binaries, not committed):

```
planning/plans/2026-05-31-reactor-devtools/demo/recording/
  observatory-demo.webm        VP8 1280×720, ~56 s
  observatory-demo.mp4         H.264 yuv420p (from ffmpeg)
  beat-01-cold-boot.png … beat-09-final-quiet.png
```

The last stdout line is machine-readable: `RESULT {"ok":true,"webm":…,"mp4":…,"keyframes":[…],"frames":74}`.

## Env knobs

| var | default | effect |
|-----|---------|--------|
| `PORT` | `4571` | fixed server port |
| `KEEP_WEBM=1` | off | keep Playwright's hashed `page@<hash>.webm` instead of renaming to `observatory-demo.webm` |
| `SKIP_MP4=1` | off | skip the ffmpeg transcode (webm only) |

## Requirements

- `playwright@1.60.0` (a **devDependency** of this package) + its Chromium
  browser. The script calls `npx playwright install chromium` defensively if the
  browser binary is missing.
- `ffmpeg` for the mp4 (optional; the webm is produced regardless).

## Why Playwright, not `screencapture`

Deterministic, repeatable frame-by-frame pacing, no macOS screen-recording
permission prompt, agent-runnable headless, and it captures only the page (not
the whole desktop). `screencapture -v` remains a fallback but is not used.
