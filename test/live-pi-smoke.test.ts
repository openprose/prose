import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  join,
  mkdtempSync,
  test,
  tmpdir,
} from "./support";

describe("OpenProse live Pi smoke ladder", () => {
  test("skips by default and writes an inspectable smoke report", () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-live-pi-skip-"));
    const out = join(root, "live-pi.json");
    const result = runSmoke(["--tier", "cheap", "--out", out, "--skip"], {});

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(readFileSync(out, "utf8"));
    expect(report).toMatchObject({
      live_pi_smoke_version: "0.1",
      enabled: false,
      selected_tiers: ["cheap"],
      model_provider: "openrouter",
      model: "google/gemini-3-flash-preview",
      status: "skipped",
      results: [
        {
          tier: "cheap",
          label: "company-signal-brief",
          status: "skipped",
          failure_class: null,
          session_count: 0,
          trace_events: 0,
        },
      ],
    });
    expect(readFileSync(join(root, "live-pi.md"), "utf8")).toContain(
      "| cheap | company-signal-brief | skipped |",
    );
  });

  test("classifies missing live auth before opening Pi sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-live-pi-auth-"));
    const out = join(root, "live-pi.json");
    const result = runSmoke(
      ["--tier", "medium", "--out", out, "--enable", "--allow-failure"],
      {
        OPENPROSE_LIVE_PI_SMOKE: "1",
        OPENPROSE_LIVE_PI_MODEL_PROVIDER: "openrouter",
        OPENPROSE_PI_API_KEY: "",
        OPENROUTER_API_KEY: "",
      },
    );

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(readFileSync(out, "utf8"));
    expect(report).toMatchObject({
      enabled: true,
      selected_tiers: ["medium"],
      status: "blocked",
      results: [
        {
          tier: "medium",
          label: "lead-program-designer",
          status: "blocked",
          failure_class: "auth_missing",
          session_count: 0,
          diagnostics: [
            expect.objectContaining({
              code: "live_pi_auth_missing",
            }),
          ],
        },
      ],
    });
  });

  test("keeps live Pi agent and run artifacts ignored", () => {
    const paths = [
      ".prose/live-pi-agent/auth.json",
      ".prose/live-pi-agent/models.json",
      ".prose/live-pi-runs/example/run.json",
    ];
    const result = Bun.spawnSync(["git", "check-ignore", ...paths], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout).trim().split("\n")).toEqual(paths);
  });
});

function runSmoke(args: string[], env: Record<string, string>) {
  return Bun.spawnSync(["bun", "scripts/live-pi-smoke.ts", ...args], {
    cwd: join(import.meta.dir, ".."),
    env: {
      ...Bun.env,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}
