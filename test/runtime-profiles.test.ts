import {
  describe,
  expect,
  fixture,
  join,
  listRunAttemptRecords,
  mkdtempSync,
  test,
  tmpdir,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";
import { resolveRuntimeProfile } from "../src/runtime";
import { runSource } from "../src/run";
import type { ProviderRequest } from "../src/providers";

describe("OpenProse runtime profiles", () => {
  test("defaults graph execution to a persistent Pi runtime profile", () => {
    const profile = resolveRuntimeProfile({ env: {} });

    expect(profile).toEqual({
      profile_version: "0.1",
      graph_vm: "pi",
      single_run_harness: null,
      model_provider: null,
      model: null,
      thinking: null,
      tools: ["read", "write"],
      persist_sessions: true,
    });
  });

  test("keeps model providers separate from graph VMs", () => {
    const profile = resolveRuntimeProfile({
      env: {
        OPENPROSE_PI_MODEL_PROVIDER: "openrouter",
        OPENPROSE_PI_MODEL_ID: "google/gemini-3-flash-preview",
        OPENPROSE_PI_THINKING_LEVEL: "low",
        OPENPROSE_PI_TOOLS: "write,read",
      },
    });

    expect(profile).toMatchObject({
      graph_vm: "pi",
      model_provider: "openrouter",
      model: "google/gemini-3-flash-preview",
      thinking: "low",
      tools: ["read", "write"],
    });
  });

  test("rejects model providers and single-run harnesses as graph VMs", () => {
    expect(() =>
      resolveRuntimeProfile({
        profile: {
          graph_vm: "openrouter",
        },
      }),
    ).toThrow("is a model provider, not an OpenProse graph VM");

    expect(() =>
      resolveRuntimeProfile({
        profile: {
          graph_vm: "codex_cli",
        },
      }),
    ).toThrow("is a single-run harness, not the reactive graph VM");
  });

  test("rejects profiles that conflict with an explicitly selected graph VM", () => {
    expect(() =>
      resolveRuntimeProfile({
        profile: {
          graph_vm: "fixture",
        },
      }),
    ).toThrow("graph_vm 'fixture' has been removed");
  });

  test("records runtime profile fields on provider requests, runs, and attempts", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-runtime-profile-"));
    const requests: ProviderRequest[] = [];
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "runtime-profile-run",
      provider: scriptedPiRuntime({
        outputs: {
          message: "Hello from profiled Pi.",
        },
        onRequest: (request) => requests.push(request),
      }),
      runtimeProfile: {
        graph_vm: "pi",
        model_provider: "openrouter",
        model: "google/gemini-3-flash-preview",
        thinking: "low",
        tools: ["read", "write"],
        persist_sessions: true,
      },
      createdAt: "2026-04-26T16:20:00.000Z",
    });

    expect(result.record.runtime).toMatchObject({
      graph_vm: "pi",
      model_provider: "openrouter",
      model: "google/gemini-3-flash-preview",
      thinking: "low",
      persist_sessions: true,
    });
    expect(result.record.runtime.profile).toEqual(requests[0]?.runtime_profile);

    const attempts = await listRunAttemptRecords(
      join(runRoot, ".prose-store"),
      "runtime-profile-run",
    );
    expect(attempts[0]?.runtime_profile).toMatchObject({
      graph_vm: "pi",
      model_provider: "openrouter",
      model: "google/gemini-3-flash-preview",
    });
  });
});
