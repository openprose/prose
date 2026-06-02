/**
 * The OFFLINE render-sandbox gate (CLI plan Phase 5; RENDER-SANDBOX-OPTIONS §5–§6).
 *
 * Hermetic: no key, no network, no Docker daemon required (the Docker probe + exec
 * are INJECTED). Proves the four gate items:
 *   1. `mode: none` (the locked default) → buildSandboxRunner returns NO runner;
 *      the render relies on the SDK's bounded cwd-scoped LocalShell.
 *   2. `mode: docker` with Docker PRESENT → the constructed argv is `docker run
 *      --rm --network=none -v <ws>:<ws> -w <ws> <image> <cmd> <args...>` — network
 *      FORCED off, workspace-scoped; the runner execs through the injected host.
 *   3. `mode: docker` with Docker ABSENT → NO runner + a surfaced note (never a
 *      hard-fail; the run degrades to the bounded shell).
 *   4. `shell_timeout_ms` flows onto the render config the CLI hands `runProject`
 *      (Change C forwards it to createAgentRender; the SDK equivalence test proves
 *      the forward). Captured via an injected `runProject` impl.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSandboxRunner,
  buildDockerArgv,
  DEFAULT_SANDBOX_IMAGE,
  type SandboxHost,
  type SandboxExecResponse,
} from '../run/sandbox';
import { callRunProject, type RunRender } from '../run/load-run-project';
import {
  createMemoryStorageAdapter,
  createSystemClockAdapter,
} from '@openprose/reactor';
import type { SandboxConfig } from '../config';

const WS = '/tmp/openprose-ws';

/** A host whose Docker probe + exec are stubbed (no daemon needed). */
function fakeHost(opts: {
  available: boolean;
  onExec?: (argv: readonly string[]) => SandboxExecResponse;
}): { host: SandboxHost; calls: (readonly string[])[] } {
  const calls: (readonly string[])[] = [];
  const host: SandboxHost = {
    dockerAvailable: () => opts.available,
    exec: (argv) => {
      calls.push(argv);
      return (
        opts.onExec?.(argv) ?? { exit_code: 0, stdout: 'ok', stderr: '' }
      );
    },
  };
  return { host, calls };
}

describe('render sandbox runner (Phase 5)', () => {
  it('mode:none → no runner (locked default)', () => {
    const cfg: SandboxConfig = { mode: 'none', shell_timeout_ms: 300_000 };
    const built = buildSandboxRunner(cfg, WS, fakeHost({ available: true }).host);
    assert.equal(built.runner, undefined);
    assert.equal(built.note, undefined);
  });

  it('mode:docker + Docker present → workspace-scoped, --network=none argv', async () => {
    const cfg: SandboxConfig = { mode: 'docker', shell_timeout_ms: 300_000 };
    const { host, calls } = fakeHost({
      available: true,
      onExec: () => ({ exit_code: 0, stdout: 'hi', stderr: '' }),
    });
    const built = buildSandboxRunner(cfg, WS, host);
    assert.ok(built.runner, 'a runner is constructed when Docker is present');
    assert.equal(built.note, undefined);

    const resp = await built.runner!({ command: 'echo', args: ['hi'] });
    assert.equal(resp.exit_code, 0);
    assert.equal(resp.stdout, 'hi');

    // The constructed argv: network FORCED off + workspace-scoped bind/workdir.
    assert.equal(calls.length, 1);
    const argv = calls[0]!;
    assert.ok(argv.includes('--network=none'), 'network is forced off');
    assert.ok(argv.includes('--rm'), 'container is throwaway');
    // Workspace-scoped: bind-mount <ws>:<ws> and -w <ws>.
    const vIdx = argv.indexOf('-v');
    assert.ok(vIdx >= 0 && argv[vIdx + 1] === `${WS}:${WS}`, 'bind-mounts the workspace at its own path');
    const wIdx = argv.indexOf('-w');
    assert.ok(wIdx >= 0 && argv[wIdx + 1] === WS, 'runs with cwd = workspace');
    // The default image is used + the command/args are appended last.
    assert.ok(argv.includes(DEFAULT_SANDBOX_IMAGE), 'default image when unset');
    assert.deepEqual(argv.slice(-2), ['echo', 'hi'], 'command + args are last');
  });

  it('mode:docker honors a custom image', () => {
    const cfg: SandboxConfig = {
      mode: 'docker',
      image: 'python:3.14-slim',
      shell_timeout_ms: 300_000,
    };
    const { host, calls } = fakeHost({ available: true });
    const built = buildSandboxRunner(cfg, WS, host);
    void built.runner!({ command: 'python', args: ['-V'] });
    assert.ok(calls[0]!.includes('python:3.14-slim'));
    assert.ok(!calls[0]!.includes(DEFAULT_SANDBOX_IMAGE));
  });

  it('mode:docker + Docker absent → no runner + a surfaced note (never hard-fails)', () => {
    const cfg: SandboxConfig = { mode: 'docker', shell_timeout_ms: 300_000 };
    const built = buildSandboxRunner(cfg, WS, fakeHost({ available: false }).host);
    assert.equal(built.runner, undefined);
    assert.ok(built.note, 'a note is surfaced');
    assert.match(built.note!, /Docker is not available/i);
  });

  it('buildDockerArgv is a pure, workspace-scoped, network-off argv', () => {
    const argv = buildDockerArgv(WS, 'img:tag', 'ls', ['-la', '/etc']);
    assert.deepEqual(argv, [
      'docker',
      'run',
      '--rm',
      '--network=none',
      '-v',
      `${WS}:${WS}`,
      '-w',
      WS,
      'img:tag',
      'ls',
      '-la',
      '/etc',
    ]);
  });

  it('shellTimeoutMs + sandbox flow onto the render config the CLI hands runProject', async () => {
    // Capture the exact `render` object callRunProject builds (Change C forwards
    // both to createAgentRender; the SDK equivalence test proves the forward).
    // The fake `runProject` is the SDK's own `RunProjectFn` (typed via the
    // `callRunProject` impl seam): it captures the `render` the CLI hands it.
    // `render` IS the SDK `RunProjectRender` now (no `Record<string, unknown>`
    // mirror) — so we read `sandbox`/`shellTimeoutMs` as typed fields.
    let captured: RunRender | undefined;
    const fakeRunProject: Parameters<typeof callRunProject>[1] = async (input) => {
      captured = input.render;
      return { reactor: {} as never, bootResults: [] };
    };

    const sandboxRunner = () => ({ exit_code: 0, stdout: '', stderr: '' });
    const render: RunRender = {
      // The offline fake render body is never invoked here (we only capture the
      // config), so a no-op factory stands in; cast through `unknown` to the SDK
      // `AsyncMountedRender` as the suite's fake renders do.
      buildRender: (() => async () => ({})) as unknown as RunRender['buildRender'],
      sandbox: sandboxRunner,
      shellTimeoutMs: 42_000,
    };

    await callRunProject(
      {
        compiled: {} as never,
        adapters: {
          clock: createSystemClockAdapter(),
          storage: createMemoryStorageAdapter(),
        },
        render,
      },
      fakeRunProject,
    );

    assert.ok(captured, 'runProject received a render config');
    assert.equal(captured!.shellTimeoutMs, 42_000, 'shell timeout flows through');
    assert.equal(captured!.sandbox, sandboxRunner, 'the runner flows through');
  });
});
