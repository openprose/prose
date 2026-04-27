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
import type { NodeRunRequest } from "../src/node-runners";

describe("OpenProse runtime profiles", () => {
  test("defaults graph execution to a persistent Pi runtime profile", () => {
    const profile = resolveRuntimeProfile({ env: {} });

    expect(profile).toEqual({
      profile_version: "0.1",
      graph_vm: "pi",
      execution_placement: "local",
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

  test("accepts explicit runtime profile input without environment variables", () => {
    const profile = resolveRuntimeProfile({
      profile: {
        execution_placement: "distributed",
        model_provider: "openrouter",
        model: "google/gemini-3-flash-preview",
        thinking: "medium",
        tools: ["write", "read"],
        persist_sessions: false,
      },
      env: {},
    });

    expect(profile).toMatchObject({
      graph_vm: "pi",
      execution_placement: "distributed",
      model_provider: "openrouter",
      model: "google/gemini-3-flash-preview",
      thinking: "medium",
      tools: ["read", "write"],
      persist_sessions: false,
    });
  });

  test("deterministic outputs keep the scripted Pi profile even when model flags are supplied", () => {
    const profile = resolveRuntimeProfile({
      profile: {
        model_provider: "openrouter",
        model: "google/gemini-3-flash-preview",
        thinking: "low",
      },
      deterministicOutputs: {
        message: "Hello.",
      },
      env: {},
    });

    expect(profile).toMatchObject({
      graph_vm: "pi",
      model_provider: "scripted",
      model: "deterministic-output",
      thinking: "off",
    });
  });

  test("rejects unregistered graph VMs", () => {
    expect(() =>
      resolveRuntimeProfile({
        profile: {
          graph_vm: "unknown-vm",
        },
      }),
    ).toThrow("Runtime profile graph_vm 'unknown-vm' is not registered");
  });

  test("rejects profiles that conflict with an explicitly selected graph VM", () => {
    expect(() =>
      resolveRuntimeProfile({
        profile: {
          graph_vm: "pi",
        },
        selectedGraphVm: "custom-vm",
      }),
    ).toThrow("graph_vm 'pi' conflicts with selected graph VM 'custom-vm'");
  });

  test("records runtime profile fields on node-run requests, runs, and attempts", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-runtime-profile-"));
    const requests: NodeRunRequest[] = [];
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "runtime-profile-run",
      nodeRunner: scriptedPiRuntime({
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
