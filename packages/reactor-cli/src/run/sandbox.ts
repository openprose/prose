/**
 * Render sandbox runner construction (CLI Phase 5; RENDER-SANDBOX-OPTIONS §5–§6).
 *
 * Turns the reactor-owned `[sandbox]` config (the THREAT-MODEL knob the reactor
 * owns, not the raw SDK type) into the concrete `RenderSandboxRunner` the CLI
 * hands `runProject` → `createAgentRender` → the render's `sandbox_exec` tool.
 * The SDK ships NO concrete runner (Change C kept `RenderSandboxRunner` a TYPE);
 * CONSTRUCTING one is exactly this CLI concern.
 *
 * N2 OFFLINE BOUNDARY: this module is KEYLESS. It imports only `node:child_process`
 * (the Docker probe + exec) — never `@openai/agents`/`zod`. The `RenderSandboxRunner`
 * the runner satisfies is a STRUCTURAL function shape (`{command,args} =>
 * {exit_code,stdout,stderr}`), so the CLI need not import the SDK type to build a
 * value of it; the structural mirror in `load-run-project.ts` (`SandboxRunner`)
 * carries it across the dynamic-import seam. Nothing here constructs a provider.
 *
 * The two locked modes (`cli.md` §6 / RENDER-SANDBOX-OPTIONS §6):
 *   - `mode: none` (the DEFAULT, locked) → NO runner. The render relies on the
 *     SDK's cwd-scoped `LocalShell` + its 300 s / 1 MiB bound (`shell_timeout_ms`
 *     tunes the bound; it is threaded separately as `shellTimeoutMs`). The render's
 *     `sandbox_exec` simply declines (`NO_SANDBOX_MESSAGE`) — the trusted posture.
 *   - `mode: docker` → a runner that execs each command inside a throwaway,
 *     network-ISOLATED container bind-mounting ONLY the workspace:
 *       docker run --rm --network=none -v <ws>:<ws> -w <ws> <image> <cmd> <args...>
 *     Network is FORCED `none` regardless of `[sandbox].network` (the CLI owns the
 *     threat model; an untrusted render must not reach the network). When Docker
 *     is ABSENT (no daemon / binary), we DO NOT hard-fail the run: we return NO
 *     runner + a surfaced note, so the render falls back to the bounded LocalShell
 *     exactly as `mode: none` would. A missing daemon degrades, never crashes.
 *
 * `unix-local` is accepted by the config type but not yet realized here; it maps
 * to `none` (no runner) with a note until the SDK UnixLocal client is adopted
 * (RENDER-SANDBOX-OPTIONS §6 — deferred). The default stays `none`.
 */

import { spawnSync } from 'node:child_process';
import type { SandboxConfig } from '../config';

/** The default container image when `[sandbox].image` is unset (`cli.md` §6). */
export const DEFAULT_SANDBOX_IMAGE = 'node:22-bookworm-slim';

/** A sandboxed command request — the structural mirror of `ReactorSandboxRequest`. */
export interface SandboxExecRequest {
  readonly command: string;
  readonly args: readonly string[];
}

/** A sandboxed command result — the structural mirror of `ReactorSandboxResponse`. */
export interface SandboxExecResponse {
  readonly exit_code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The render sandbox runner — the structural shape the SDK's `RenderSandboxRunner`
 * type names (kept structural so this keyless module need not import the SDK).
 */
export type SandboxRunner = (
  request: SandboxExecRequest,
) => SandboxExecResponse | Promise<SandboxExecResponse>;

/** The outcome of {@link buildSandboxRunner}: the runner (or none) + an optional note. */
export interface BuiltSandboxRunner {
  /** The constructed runner, or `undefined` for `mode: none` / Docker-absent. */
  readonly runner?: SandboxRunner;
  /** A surfaced note (e.g. "Docker absent — falling back to the bounded shell"). */
  readonly note?: string;
}

/** The injectable host hooks (tests stub these; production uses the real `docker`). */
export interface SandboxHost {
  /** Probe whether Docker is usable (`docker --version`). Returns true if present. */
  readonly dockerAvailable: () => boolean;
  /** Exec the constructed argv synchronously, returning the exec outcome. */
  readonly exec: (argv: readonly string[]) => SandboxExecResponse;
}

/**
 * Build the workspace-scoped `docker run` argv for one command (FORCING
 * `--network=none` and bind-mounting ONLY the workspace at its own path). Exported
 * so the offline gate can assert the argv shape without a real Docker daemon.
 */
export function buildDockerArgv(
  workspaceDir: string,
  image: string,
  command: string,
  args: readonly string[],
): readonly string[] {
  return [
    'docker',
    'run',
    '--rm',
    // Network FORCED off — the CLI owns the threat model; an untrusted render
    // must not reach the network regardless of `[sandbox].network`.
    '--network=none',
    // Bind-mount ONLY the workspace at its own absolute path, and run there.
    '-v',
    `${workspaceDir}:${workspaceDir}`,
    '-w',
    workspaceDir,
    image,
    command,
    ...args,
  ];
}

/** The default host: a real `docker` probe + `spawnSync` exec (keyless). */
export function defaultSandboxHost(): SandboxHost {
  return {
    dockerAvailable: () => {
      try {
        const res = spawnSync('docker', ['--version'], {
          stdio: 'ignore',
          timeout: 5_000,
        });
        return res.status === 0;
      } catch {
        return false;
      }
    },
    exec: (argv: readonly string[]): SandboxExecResponse => {
      const [bin, ...rest] = argv;
      const res = spawnSync(bin ?? 'docker', rest, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      });
      return {
        exit_code: res.status ?? (res.error ? 127 : 0),
        stdout: res.stdout ?? '',
        stderr: res.stderr ?? (res.error ? String(res.error.message) : ''),
      };
    },
  };
}

/**
 * Construct the render sandbox runner from the reactor's `[sandbox]` config.
 *
 *   - `mode: none` (locked default) → `{ runner: undefined }`. The render relies
 *     on the SDK's cwd-scoped, time/output-bounded LocalShell.
 *   - `mode: unix-local` → `{ runner: undefined, note }` (deferred; maps to none).
 *   - `mode: docker`, Docker PRESENT → a runner that execs every command inside a
 *     `docker run --rm --network=none -v <ws>:<ws> -w <ws> <image> ...` container.
 *   - `mode: docker`, Docker ABSENT → `{ runner: undefined, note }`. NEVER throws;
 *     the run degrades to the bounded LocalShell.
 *
 * `workspaceDir` is the per-project workspace ROOT the container bind-mounts; the
 * render's per-node working dirs live beneath it, and the harness harvests on the
 * host side (the determinism boundary is unaffected — RENDER-SANDBOX-OPTIONS §4).
 */
export function buildSandboxRunner(
  sandbox: SandboxConfig,
  workspaceDir: string,
  host: SandboxHost = defaultSandboxHost(),
): BuiltSandboxRunner {
  if (sandbox.mode === 'none') {
    return {};
  }

  if (sandbox.mode === 'unix-local') {
    return {
      note:
        "sandbox mode 'unix-local' is not yet realized; falling back to the " +
        'bounded cwd-scoped shell (mode none).',
    };
  }

  // mode: docker — probe the daemon; a missing daemon degrades, never crashes.
  if (!host.dockerAvailable()) {
    return {
      note:
        "sandbox mode 'docker' requested but Docker is not available; falling " +
        'back to the bounded cwd-scoped shell. Install/start Docker to isolate ' +
        'renders.',
    };
  }

  const image =
    sandbox.image !== undefined && sandbox.image.length > 0
      ? sandbox.image
      : DEFAULT_SANDBOX_IMAGE;

  const runner: SandboxRunner = ({ command, args }) => {
    const argv = buildDockerArgv(workspaceDir, image, command, args);
    return host.exec(argv);
  };

  return { runner };
}
