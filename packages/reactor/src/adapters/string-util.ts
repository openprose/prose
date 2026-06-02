/**
 * SDK-free string helpers shared across adapters. Pure functions only — imports
 * NOTHING from `@openai/agents` or `zod`, so they are safe in any adapter path.
 */

/** Strip a single matching pair of surrounding single or double quotes. */
export function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}
