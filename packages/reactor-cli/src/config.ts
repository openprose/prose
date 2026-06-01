/**
 * `reactor.yml` config loader — keyless, offline-safe (N2).
 *
 * Parses a project's `reactor.yml` into a typed config, applies flag/env
 * overrides, and fills the defaults from `cli.md` §6. This module is reachable
 * from the offline entrypoint, so it MUST NOT static-import `@openai/agents`,
 * `zod`, or any model-bearing SDK barrel. It reads only plain files + env.
 *
 * The YAML we accept is a deliberately SMALL, zero-dependency subset — enough for
 * the `reactor.yml` schema in `cli.md` §6 (nested maps, scalar values, and the
 * `gateways:` list of maps). It is NOT a general YAML parser; a future need for
 * full YAML can swap in a real dependency behind this same typed surface.
 */

import * as fs from 'fs';
import * as path from 'path';

/** The sandbox threat-model knob (`cli.md` §6). v1 supports `none` + `docker`. */
export type SandboxMode = 'none' | 'unix-local' | 'docker';

export interface ModelConfig {
  readonly provider: string;
  readonly render_model: string;
  readonly compile_model: string;
  readonly temperature: number;
  readonly max_turns: number;
}

export interface SandboxConfig {
  readonly mode: SandboxMode;
  readonly image?: string;
  readonly network?: string;
  readonly shell_timeout_ms: number;
}

export interface StateConfig {
  readonly dir: string;
}

/** One external-driven gateway entry point (`cli.md` §6 / §6.1). */
export interface GatewayConfig {
  readonly node: string;
  readonly source_id?: string;
  readonly poll?: string;
  readonly connector?: Readonly<Record<string, unknown>>;
}

/** The fully-resolved, typed config the commands consume. */
export interface ReactorConfig {
  readonly state: StateConfig;
  readonly model: ModelConfig;
  readonly sandbox: SandboxConfig;
  readonly gateways: readonly GatewayConfig[];
}

/** Per-command override knobs (from global flags / env), applied over the file. */
export interface ConfigOverrides {
  /** `--state-dir` (overrides `state.dir`). */
  readonly stateDir?: string;
  /** `--project` directory (where `reactor.yml` is looked up). Default `.`. */
  readonly projectDir?: string;
  /** A model id override applied to BOTH compile + render models. */
  readonly model?: string;
}

/** The defaults from `cli.md` §6 (the keyless, no-file baseline). */
export const DEFAULT_CONFIG: ReactorConfig = Object.freeze({
  state: { dir: './.reactor' },
  model: {
    provider: 'openrouter',
    render_model: 'google/gemini-3.5-flash',
    compile_model: 'google/gemini-3.5-flash',
    temperature: 0,
    max_turns: 200,
  },
  sandbox: {
    mode: 'none' as SandboxMode,
    shell_timeout_ms: 300000,
  },
  gateways: [],
});

/** The config file name looked up at the project root. */
export const CONFIG_FILENAME = 'reactor.yml';

/**
 * Load + resolve the config for a project. Reads `<projectDir>/reactor.yml` if
 * present (absent ⇒ the bare defaults), merges it over {@link DEFAULT_CONFIG},
 * then applies the flag/env {@link ConfigOverrides}. The returned `state.dir` is
 * resolved to an ABSOLUTE path (rooted at the project dir) so every command
 * agrees on one durable location regardless of cwd.
 */
export function loadConfig(overrides: ConfigOverrides = {}): ReactorConfig {
  const projectDir = path.resolve(overrides.projectDir ?? '.');
  const filePath = path.join(projectDir, CONFIG_FILENAME);

  const fromFile = readConfigFile(filePath);
  const merged = mergeConfig(DEFAULT_CONFIG, fromFile);

  // Flag/env overrides win over the file.
  const stateDirRaw = overrides.stateDir ?? merged.state.dir;
  const stateDir = path.isAbsolute(stateDirRaw)
    ? stateDirRaw
    : path.resolve(projectDir, stateDirRaw);

  const modelOverride = overrides.model;
  const model: ModelConfig = modelOverride
    ? { ...merged.model, render_model: modelOverride, compile_model: modelOverride }
    : merged.model;

  return {
    state: { dir: stateDir },
    model,
    sandbox: merged.sandbox,
    gateways: merged.gateways,
  };
}

/** Read + parse the config file; returns a partial config (absent ⇒ `{}`). */
function readConfigFile(filePath: string): Partial<RawConfig> {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }
  const tree = parseSimpleYaml(text);
  return shapeRawConfig(tree);
}

/** Mutable views used only while shaping the parsed tree (config is readonly). */
type MutableModel = { -readonly [K in keyof ModelConfig]?: ModelConfig[K] };
type MutableSandbox = { -readonly [K in keyof SandboxConfig]?: SandboxConfig[K] };

/** The loosely-typed config tree before defaulting. */
interface RawConfig {
  state?: { dir?: string };
  model?: MutableModel;
  sandbox?: MutableSandbox;
  gateways?: GatewayConfig[];
}

/** Shape a parsed YAML value into the partial raw config (best-effort, typed). */
function shapeRawConfig(tree: unknown): Partial<RawConfig> {
  if (!isRecord(tree)) {
    return {};
  }
  const out: RawConfig = {};

  const state = tree['state'];
  if (isRecord(state) && typeof state['dir'] === 'string') {
    out.state = { dir: state['dir'] };
  }

  const model = tree['model'];
  if (isRecord(model)) {
    out.model = {};
    if (typeof model['provider'] === 'string') out.model.provider = model['provider'];
    if (typeof model['render_model'] === 'string')
      out.model.render_model = model['render_model'];
    if (typeof model['compile_model'] === 'string')
      out.model.compile_model = model['compile_model'];
    const temp = toNumber(model['temperature']);
    if (temp !== undefined) out.model.temperature = temp;
    const turns = toNumber(model['max_turns']);
    if (turns !== undefined) out.model.max_turns = turns;
  }

  const sandbox = tree['sandbox'];
  if (isRecord(sandbox)) {
    out.sandbox = {};
    const mode = sandbox['mode'];
    if (mode === 'none' || mode === 'unix-local' || mode === 'docker') {
      out.sandbox.mode = mode;
    }
    if (typeof sandbox['image'] === 'string') out.sandbox.image = sandbox['image'];
    if (typeof sandbox['network'] === 'string') out.sandbox.network = sandbox['network'];
    const timeout = toNumber(sandbox['shell_timeout_ms']);
    if (timeout !== undefined) out.sandbox.shell_timeout_ms = timeout;
  }

  const gateways = tree['gateways'];
  if (Array.isArray(gateways)) {
    out.gateways = gateways.filter(isRecord).map(shapeGateway);
  }

  return out;
}

function shapeGateway(raw: Record<string, unknown>): GatewayConfig {
  const node = typeof raw['node'] === 'string' ? raw['node'] : '';
  const out: Record<string, unknown> = { node };
  if (typeof raw['source_id'] === 'string') out['source_id'] = raw['source_id'];
  if (typeof raw['poll'] === 'string') out['poll'] = raw['poll'];
  if (isRecord(raw['connector'])) out['connector'] = raw['connector'];
  return out as unknown as GatewayConfig;
}

/** Merge a partial raw config over the defaults (shallow per top-level key). */
function mergeConfig(base: ReactorConfig, over: Partial<RawConfig>): ReactorConfig {
  const sandbox: SandboxConfig = {
    mode: over.sandbox?.mode ?? base.sandbox.mode,
    shell_timeout_ms: over.sandbox?.shell_timeout_ms ?? base.sandbox.shell_timeout_ms,
    ...(over.sandbox?.image !== undefined ? { image: over.sandbox.image } : {}),
    ...(over.sandbox?.network !== undefined ? { network: over.sandbox.network } : {}),
  };
  const model: ModelConfig = {
    provider: over.model?.provider ?? base.model.provider,
    render_model: over.model?.render_model ?? base.model.render_model,
    compile_model: over.model?.compile_model ?? base.model.compile_model,
    temperature: over.model?.temperature ?? base.model.temperature,
    max_turns: over.model?.max_turns ?? base.model.max_turns,
  };
  return {
    state: { dir: over.state?.dir ?? base.state.dir },
    model,
    sandbox,
    gateways: over.gateways ?? [...base.gateways],
  };
}

// ---------------------------------------------------------------------------
// A tiny, zero-dependency YAML subset parser (offline-light).
// ---------------------------------------------------------------------------

/**
 * Parse the SMALL YAML subset `reactor.yml` uses: 2-space-indented nested maps,
 * scalar `key: value` pairs, and block lists (`- ` items) whose items are either
 * scalars or inline `key: value` maps continued on indented lines. Comments
 * (`#`) and blank lines are ignored. This is intentionally minimal — it is NOT a
 * conformant YAML parser; it is just enough for the documented config schema.
 */
export function parseSimpleYaml(text: string): unknown {
  const lines = stripComments(text);
  const [value] = parseBlock(lines, 0, 0);
  return value;
}

interface Line {
  readonly indent: number;
  readonly content: string;
  readonly raw: string;
}

function stripComments(text: string): Line[] {
  const out: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const withoutComment = stripInlineComment(raw);
    if (withoutComment.trim().length === 0) {
      continue;
    }
    const indent = withoutComment.length - withoutComment.replace(/^ +/, '').length;
    out.push({ indent, content: withoutComment.trim(), raw: withoutComment });
  }
  return out;
}

/** Drop a `#` comment that is not inside a quoted string. */
function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      // A comment marker must be at line-start or preceded by whitespace.
      if (i === 0 || line[i - 1] === ' ') {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

/**
 * Parse the block of lines whose indent is `>= minIndent`, starting at `start`.
 * Returns the parsed value + the index of the first unconsumed line. Decides
 * map vs list by the first line's leading `- `.
 */
function parseBlock(lines: Line[], start: number, minIndent: number): [unknown, number] {
  if (start >= lines.length) {
    return [null, start];
  }
  const blockIndent = lines[start]!.indent;
  if (blockIndent < minIndent) {
    return [null, start];
  }
  if (lines[start]!.content.startsWith('- ') || lines[start]!.content === '-') {
    return parseList(lines, start, blockIndent);
  }
  return parseMap(lines, start, blockIndent);
}

function parseMap(lines: Line[], start: number, indent: number): [Record<string, unknown>, number] {
  const map: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent < indent) break;
    if (line.indent > indent) {
      // Unexpected deeper line without a parent key — skip defensively.
      i++;
      continue;
    }
    if (line.content.startsWith('- ')) break;
    const { key, value } = splitKeyValue(line.content);
    if (value.length > 0) {
      map[key] = parseScalar(value);
      i++;
    } else {
      // A nested block follows on more-indented lines (or nothing).
      const [child, next] = parseBlock(lines, i + 1, indent + 1);
      map[key] = child;
      i = next;
    }
  }
  return [map, i];
}

function parseList(lines: Line[], start: number, indent: number): [unknown[], number] {
  const list: unknown[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent < indent || !line.content.startsWith('-')) break;
    if (line.indent > indent) break;
    const itemBody = line.content.replace(/^-\s*/, '');
    if (itemBody.length === 0) {
      // The item's content is on the following indented lines.
      const [child, next] = parseBlock(lines, i + 1, indent + 1);
      list.push(child);
      i = next;
    } else if (looksLikeKeyValue(itemBody)) {
      // Inline first map entry; subsequent entries continue on indented lines.
      const itemIndent = line.indent + 2;
      const synthetic: Line[] = [{ indent: itemIndent, content: itemBody, raw: itemBody }];
      let j = i + 1;
      while (j < lines.length && lines[j]!.indent >= itemIndent && !lines[j]!.content.startsWith('- ')) {
        synthetic.push(lines[j]!);
        j++;
      }
      const [child] = parseMap(synthetic, 0, itemIndent);
      list.push(child);
      i = j;
    } else {
      list.push(parseScalar(itemBody));
      i++;
    }
  }
  return [list, i];
}

function splitKeyValue(content: string): { key: string; value: string } {
  const colon = findKeyColon(content);
  if (colon === -1) {
    return { key: content.trim(), value: '' };
  }
  return {
    key: unquoteScalar(content.slice(0, colon).trim()),
    value: content.slice(colon + 1).trim(),
  };
}

/** The colon that separates an inline `key: value` (first `: ` or trailing `:`). */
function findKeyColon(content: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ':' && !inSingle && !inDouble) {
      if (i === content.length - 1 || content[i + 1] === ' ') {
        return i;
      }
    }
  }
  return -1;
}

function looksLikeKeyValue(content: string): boolean {
  // Inline `{ ... }` flow maps are handled by parseScalar; here we only mean
  // a bare `key: value` block item.
  if (content.startsWith('{')) return false;
  return findKeyColon(content) !== -1;
}

/** Parse a scalar value: inline flow map/list, number, boolean, null, or string. */
function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return parseFlowMap(trimmed);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parseFlowList(trimmed);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~' || trimmed === '') return null;
  const num = toNumber(trimmed);
  if (num !== undefined && /^[-+]?[0-9.eE+]+$/.test(trimmed)) return num;
  return unquoteScalar(trimmed);
}

/** Parse a `{ a: 1, b: "x" }` inline flow map. */
function parseFlowMap(text: string): Record<string, unknown> {
  const inner = text.slice(1, -1).trim();
  const out: Record<string, unknown> = {};
  if (inner.length === 0) return out;
  for (const part of splitTopLevel(inner, ',')) {
    const colon = findKeyColon(part);
    if (colon === -1) continue;
    const key = unquoteScalar(part.slice(0, colon).trim());
    out[key] = parseScalar(part.slice(colon + 1).trim());
  }
  return out;
}

/** Parse a `[a, b, c]` inline flow list. */
function parseFlowList(text: string): unknown[] {
  const inner = text.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return splitTopLevel(inner, ',').map((p) => parseScalar(p.trim()));
}

/** Split on `sep` at the top level (respecting quotes + nested `{}`/`[]`). */
function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let buf = '';
  for (const ch of text) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
      else if (ch === sep && depth === 0) {
        out.push(buf);
        buf = '';
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim().length > 0) out.push(buf);
  return out;
}

function unquoteScalar(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
