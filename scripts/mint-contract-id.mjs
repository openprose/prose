#!/usr/bin/env node
// Mint Contract Markdown identities.
//
// A `kind: responsibility` or `kind: gateway` file may carry `id:` frontmatter
// to give the contract an identity that survives filename and `name:` renames;
// without one, the slug is the identity. The format is defined in
// skills/open-prose/contract-markdown.md (Frontmatter): a UUIDv7-compatible
// 16-byte value rendered as uppercase Crockford base32, 26 characters from
// `0-9A-HJKMNP-TV-Z`, minted once and never hand-typed.
//
//   node scripts/mint-contract-id.mjs                         print one fresh id
//   node scripts/mint-contract-id.mjs --ensure [--add] <file>… repair ids in place
//   node scripts/mint-contract-id.mjs --check  [--add] <file>… report, change nothing
//
// `--ensure` replaces an `id:` that does not match the format, on a file of any
// kind, and never touches a well-formed one. It does not add an `id:` where
// none exists: the field is optional, so a missing id is not a defect. Pass
// `--add` to also insert one on responsibility and gateway files that lack it,
// placed after `version:` (or after `kind:` when there is no `version:`).
// `--check` runs the same logic and reports what `--ensure` would change.
//
// No dependencies; runs on any Node with `node:crypto` and `node:fs`.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ID_LINE = /^id:\s*([0-9A-HJKMNP-TV-Z]{26})\s*$/m;
const ANY_ID_LINE = /^id:.*$/m;
const KIND_LINE = /^kind:\s*(\S+)\s*$/m;
const VERSION_LINE = /^version:.*$/m;
const MAY_CARRY_ID = new Set(["responsibility", "gateway"]);

// UUIDv7: 48-bit millisecond timestamp, 4-bit version (7), 2-bit variant (10),
// and 74 random bits. Sorting the rendered id sorts by mint time.
export function uuidv7Bytes(now = Date.now()) {
  const bytes = randomBytes(16);
  let ms = BigInt(now);
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = Number(ms & 0xffn);
    ms >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
}

// 128 bits packed big-endian into 26 five-bit groups (130 bits); the two
// leading pad bits are zero, so the first character is always `0`–`7`.
export function toCrockford(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  for (let shift = 125n; shift >= 0n; shift -= 5n) {
    out += CROCKFORD[Number((n >> shift) & 31n)];
  }
  return out;
}

export function mintId() {
  return toCrockford(uuidv7Bytes());
}

function frontmatterRange(source) {
  if (!source.startsWith("---\n")) return null;
  const end = source.indexOf("\n---", 4);
  if (end === -1) return null;
  return { start: 4, end: end + 1 }; // body of the block, exclusive of fences
}

// Returns { status, source } where status is one of:
//   "ok"        a well-formed id is already present
//   "reminted"  a malformed id was replaced
//   "minted"    a missing id was inserted (only with `add`)
//   "skipped"   no id present and none added
//   "invalid"   no frontmatter block to write into
export function ensureId(source, { add = false } = {}) {
  const range = frontmatterRange(source);
  if (!range) return { status: "invalid", source };
  const block = source.slice(range.start, range.end);
  if (ID_LINE.test(block)) return { status: "ok", source };

  const fresh = `id: ${mintId()}`;

  if (ANY_ID_LINE.test(block)) {
    const next = block.replace(ANY_ID_LINE, fresh);
    return {
      status: "reminted",
      source: source.slice(0, range.start) + next + source.slice(range.end),
    };
  }

  const kind = KIND_LINE.exec(block)?.[1] ?? "";
  if (!add || !MAY_CARRY_ID.has(kind)) {
    return { status: "skipped", source };
  }

  const anchor = VERSION_LINE.exec(block) ?? KIND_LINE.exec(block);
  if (!anchor) return { status: "invalid", source };
  const at = anchor.index + anchor[0].length;
  const next = `${block.slice(0, at)}\n${fresh}${block.slice(at)}`;
  return {
    status: "minted",
    source: source.slice(0, range.start) + next + source.slice(range.end),
  };
}

function usage() {
  console.error(
    [
      "usage:",
      "  node scripts/mint-contract-id.mjs",
      "  node scripts/mint-contract-id.mjs --ensure [--add] <file>...",
      "  node scripts/mint-contract-id.mjs --check  [--add] <file>...",
    ].join("\n"),
  );
  process.exit(2);
}

function main(argv) {
  if (argv.length === 0) {
    console.log(mintId());
    return 0;
  }
  const mode = argv[0];
  if (mode !== "--ensure" && mode !== "--check") usage();
  const add = argv.includes("--add");
  const files = argv.slice(1).filter((a) => a !== "--add");
  if (files.length === 0) usage();

  let failures = 0;
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const { status, source } = ensureId(before, { add });
    const changed = status === "minted" || status === "reminted";
    if (status === "invalid") failures += 1;
    if (mode === "--ensure" && changed) writeFileSync(file, source);
    if (mode === "--check" && changed) failures += 1;
    if (status !== "ok" && status !== "skipped") {
      console.log(`${status.padEnd(8)} ${file}`);
    }
  }
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
