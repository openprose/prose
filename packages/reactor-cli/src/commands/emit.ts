/** Shared CLI error emitter: print a fatal message in the right shape (JSON
 * envelope under `--json`, else the bare line) and return exit code 1. */
export function emitError(
  write: (line: string) => void,
  json: boolean | undefined,
  message: string,
): number {
  if (json === true) {
    write(JSON.stringify({ status: 'error', message }));
  } else {
    write(message);
  }
  return 1;
}
