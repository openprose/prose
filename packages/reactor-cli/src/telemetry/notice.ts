/**
 * First-run telemetry disclosure — surfaced ONLY inside `reactor doctor`.
 *
 * OFFLINE-SAFE / KEYLESS (N2): reachable from the telemetry barrel that the
 * offline entrypoint loads, so this module MUST NOT static-import any
 * model-bearing dependency (`@openai/agents`, `zod`) or any SDK barrel. It reads
 * only `node:os` / `node:fs` / `node:path` and the keyless `../meta` helper.
 *
 * TRUST POSTURE (00-POLICY.md principle #2, 03-DECISIONS.md #3): the disclosure
 * is short, prominent, and shown exactly ONCE per machine. It states what we
 * collect, that it is anonymous, the permanent one-liner to turn it off, and a
 * link to the published schema (`TELEMETRY.md`). It is printed to STDOUT via the
 * command's `write` callback (NOT stderr, NOT a standalone banner at CLI entry).
 *
 * "Once per machine" is tracked by `noticeShownVersion` in the machine config
 * (`~/.reactor/config.json`, schema `{ installId, telemetryEnabled?,
 * noticeShownVersion }`). This leaf owns ONLY the `noticeShownVersion` field; it
 * reads/merges the surrounding config object verbatim so it composes cleanly with
 * the install-id / opt-out fields written by `./identity`.
 *
 * SINGLE SOURCE OF TRUTH: the config location is resolved EXCLUSIVELY through the
 * `./identity` leaf (`readMachineConfig` / `writeMachineConfig`), which honors the
 * `REACTOR_CONFIG_DIR` test seam. This is deliberate: `doctor`'s first-run
 * detection reads `readMachineConfig()` and the notice stamps via this leaf, so
 * both MUST point at the same file in every environment (tests, CI, redirected
 * config). Re-deriving `~/.reactor` from `os.homedir()` here would diverge from
 * the seam and desync the first-run flag from the once-per-machine stamp.
 *
 * FAIL-CLOSED: every filesystem touch is wrapped (in the identity leaf) — a read
 * or write fault must never throw out of `doctor` and never block the CLI. A
 * fault simply suppresses the notice (we never print twice, and we tolerate not
 * printing at all).
 */

import { cliVersion } from '../meta';
import { readMachineConfig, writeMachineConfig, type MachineConfig } from './identity';

/**
 * The disclosure copy. Respectful, anonymous, opt-out-first. Returned as an
 * array of lines so the caller can route every line through its `write`
 * callback (the command's stdout sink) without us assuming a newline policy.
 */
function noticeLines(): string[] {
  return [
    '',
    'Reactor collects anonymous, content-free usage telemetry to help us',
    'understand how the CLI is used (versions, OS/arch, command + outcome, and',
    'coarse bucketed counts — never your prose, file paths, names, prompts, keys,',
    'or model input/output). It is sent only by the CLI; the SDK stays silent.',
    '',
    'Turn it off any time — any one of these is permanent:',
    '  • set DO_NOT_TRACK=1 in your environment, or',
    '  • set REACTOR_TELEMETRY=0, or',
    '  • run: reactor telemetry disable',
    '',
    'Exactly what is sent, and how to inspect it, is documented in TELEMETRY.md',
    '(see `reactor telemetry --dump` to print precisely what would be sent).',
    '',
  ];
}

/**
 * Show the first-run telemetry disclosure at most ONCE per machine.
 *
 * Idempotent: if `noticeShownVersion` is already stamped at (or above) the
 * current CLI version the notice is suppressed and nothing is written. On the
 * first eligible run it writes the disclosure through `write` (the doctor
 * command's stdout sink) and stamps `noticeShownVersion` so subsequent runs stay
 * silent.
 *
 * Never throws and never blocks: all filesystem access is fail-closed. This is
 * the ONLY export of this leaf and the exact symbol `index.ts` re-exports.
 *
 * @param write - the command's stdout line sink (one line per call, no newline).
 */
export function maybeShowDoctorNotice(write: (line: string) => void): void {
  const version = cliVersion();
  // Read through the identity leaf so the `REACTOR_CONFIG_DIR` seam is honored —
  // this is the SAME file `doctor`'s first-run check reads via `readMachineConfig`.
  // `undefined` (absent / unreadable / corrupt) is treated as "not yet shown".
  const config = readMachineConfig();

  // Already shown for this (or a newer) version → suppress. We re-show only when
  // the field is absent or stamped at an OLDER version, so a notable schema/
  // copy change can re-disclose on upgrade while a same-version rerun stays mute.
  if (
    typeof config?.noticeShownVersion === 'string' &&
    !isOlderVersion(config.noticeShownVersion, version)
  ) {
    return;
  }

  for (const line of noticeLines()) {
    write(line);
  }

  // Preserve sibling-owned fields verbatim; author only `noticeShownVersion`. The
  // identity leaf's `MachineConfig` requires a string `installId`, so default to
  // `''` when no id exists yet (a later `getOrCreateInstallId()` mints the real
  // one — a blank id here is treated as "no id yet" by that leaf).
  const next: MachineConfig = {
    installId: config?.installId ?? '',
    ...(config?.telemetryEnabled !== undefined
      ? { telemetryEnabled: config.telemetryEnabled }
      : {}),
    noticeShownVersion: version,
  };
  writeMachineConfig(next);
}

/**
 * Coarse semver-ish "is `shown` older than `current`?" comparison. Compares the
 * dot-separated numeric components left-to-right; any non-numeric/garbage
 * component is treated as 0. A malformed stamp that does not parse as strictly
 * older is treated as "not older" (i.e. suppress) so a bad value can never cause
 * the notice to print on every run.
 */
function isOlderVersion(shown: string, current: string): boolean {
  if (shown === current) return false;
  const a = parseVersion(shown);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

/** Split a version into its leading numeric components (non-numeric → 0). */
function parseVersion(v: string): number[] {
  return v
    .split('.')
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
}
