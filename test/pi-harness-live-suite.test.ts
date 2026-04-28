import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  join,
  mkdtempSync,
  test,
  tmpdir,
} from "./support";

describe("OpenProse Pi harness live suite", () => {
  test("skips by default and writes an inspectable report", () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-pi-harness-live-skip-"));
    const out = join(root, "pi-harness-live.json");
    const result = runSuite(
      ["--tier", "cheap", "--out", out, "--run-root", join(root, "runs"), "--skip"],
      {
        OPENPROSE_PI_LIVE_SUITE: "",
      },
    );

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(readFileSync(out, "utf8"));
    expect(report).toMatchObject({
      pi_harness_live_suite_version: "0.1",
      enabled: false,
      selected_tiers: ["cheap"],
      model_provider: "openrouter",
      cheap_model: "google/gemini-3-flash-preview",
      status: "skipped",
      results: [
        {
          tier: "cheap",
          label: "output-tool-canary",
          status: "skipped",
          failure_class: null,
          session_count: 0,
          output_submission_count: 0,
        },
        {
          tier: "cheap",
          label: "subagent-review-canary",
          status: "skipped",
          failure_class: null,
          session_count: 0,
          subagent_manifest_entries: 0,
        },
      ],
    });
    expect(readFileSync(join(root, "pi-harness-live.md"), "utf8")).toContain(
      "| cheap | output-tool-canary | skipped |",
    );
  });

  test("classifies missing auth before opening live Pi sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-pi-harness-live-auth-"));
    const out = join(root, "pi-harness-live.json");
    const result = runSuite(
      [
        "--tier",
        "advanced",
        "--out",
        out,
        "--run-root",
        join(root, "runs"),
        "--enable",
        "--allow-failure",
      ],
      {
        OPENPROSE_PI_LIVE_SUITE: "1",
        OPENPROSE_PI_API_KEY: "",
        OPENROUTER_API_KEY: "",
      },
    );

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(readFileSync(out, "utf8"));
    expect(report).toMatchObject({
      enabled: true,
      selected_tiers: ["advanced"],
      status: "blocked",
      results: [
        {
          tier: "advanced",
          label: "advanced-output-tool-canary",
          status: "blocked",
          failure_class: "auth_missing",
          session_count: 0,
          diagnostics: [
            expect.objectContaining({
              code: "pi_harness_auth_missing",
            }),
          ],
        },
      ],
    });
  });

  test("keeps harness live artifacts ignored", () => {
    const paths = [
      ".prose/live-pi-agent/models.json",
      ".prose/pi-harness-live-runs/example/run.json",
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

function runSuite(args: string[], env: Record<string, string>) {
  return Bun.spawnSync(["bun", "scripts/pi-harness-live-suite.ts", ...args], {
    cwd: join(import.meta.dir, ".."),
    env: {
      ...Bun.env,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}
