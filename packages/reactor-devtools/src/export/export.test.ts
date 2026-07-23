// `--export` surface tests: the gist-view HTML file (contract + run artifact +
// outputs in one self-contained document). CLI-level tests spawn the built
// `dist/cli.js` (the exact bin a global install puts on PATH, same convention
// as cli.test.ts); unit-level tests exercise the renderer's escaping and
// source collection directly.
//
// (Runtime test: it runs from `dist/export/` against `dist/cli.js`.)

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createFileSystemStorageAdapter,
  createFileSystemWorldModelStore,
} from "@openprose/reactor";
import { createReceipt, createNullSignature } from "@openprose/reactor/internals";

import { collectSources, renderRunExport } from "./index";
import { openStateDir } from "../data";

const CLI = join(__dirname, "..", "cli.js");
const MASKED_RELAY = join(__dirname, "..", "..", "fixtures", "masked-relay");

function run(args: readonly string[], cwd?: string) {
  // Unrelated cwd by default, mimicking a global install (cli.test.ts).
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: cwd ?? tmpdir(),
    encoding: "utf8",
  });
}

test("--example masked-relay --export writes a self-contained gist-view file (exit 0)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdt-export-"));
  const out = join(dir, "run.html");
  const res = run(["--example", "masked-relay", "--export", out]);
  assert.equal(res.status, 0, `clean chain → exit 0 (stderr: ${res.stderr})`);
  assert.ok(existsSync(out), "the export file is written");
  const html = readFileSync(out, "utf8");
  // The three sections of the gist view, in order.
  const iContract = html.indexOf("<h2>Contract");
  const iRun = html.indexOf("<h2>Run");
  const iOutputs = html.indexOf("<h2>Outputs");
  assert.ok(iContract >= 0 && iRun > iContract && iOutputs > iRun,
    "Contract → Run → Outputs sections render in order");
  // The chain verdict is in the document (trust-first).
  assert.ok(html.includes("chain ✓ verified"), "the clean chain badge renders");
  // Run artifact content: a known node and the receipt timeline.
  assert.ok(html.includes("signal-ledger"), "a known node appears in the run");
  assert.ok(html.includes("Raw receipts"), "the raw-receipt expansion is present");
  // Outputs: the published world-model files made it in.
  assert.ok(html.includes("truth.json"), "published world-model files render");
  // No source snapshot in a reactor state-dir → the hint, not a fabrication.
  assert.ok(/no .*source embedded|No .*source embedded/i.test(html) ||
    html.includes("No <code>.prose.md</code> source embedded"),
    "an absent contract is stated, never fabricated");
  assert.ok(res.stdout.includes("--source"), "stdout hints at --source");
});

test("--export --source <dir> embeds the .prose.md contract, escaped", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdt-export-src-"));
  const srcDir = join(dir, "contracts");
  mkdirSync(srcDir);
  // A source carrying HTML-special chars — must appear escaped, never live.
  writeFileSync(
    join(srcDir, "demo.prose.md"),
    "### Maintains\n\n- `report`: <script>alert(1)</script> & \"quotes\"\n",
  );
  const out = join(dir, "run.html");
  const res = run([
    "--example", "masked-relay",
    "--export", out,
    "--source", srcDir,
    "--title", "Escaping Probe",
  ]);
  assert.equal(res.status, 0, `exit 0 (stderr: ${res.stderr})`);
  const html = readFileSync(out, "utf8");
  assert.ok(html.includes("demo.prose.md"), "the source filename renders");
  assert.ok(
    html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;"),
    "source text is HTML-escaped",
  );
  assert.ok(!html.includes("<script>alert(1)</script>"),
    "the hostile tag never appears live");
  assert.ok(html.includes("<title>Escaping Probe — reactor run</title>"),
    "--title sets the page title (escaped path)");
});

test("--export refuses an existing file without --force, overwrites with it", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdt-export-force-"));
  const out = join(dir, "run.html");
  writeFileSync(out, "precious");
  const refused = run(["--example", "masked-relay", "--export", out]);
  assert.equal(refused.status, 1, "existing target refused");
  assert.ok(/refusing to overwrite/.test(refused.stderr), "names the refusal");
  assert.equal(readFileSync(out, "utf8"), "precious", "target untouched");
  const forced = run(["--example", "masked-relay", "--export", out, "--force"]);
  assert.equal(forced.status, 0, "--force overwrites");
  assert.ok(readFileSync(out, "utf8").startsWith("<!doctype html>"));
});

test("--source / --title without --export error non-zero", () => {
  const res = run(["--example", "masked-relay", "--describe", "--source", "/tmp"]);
  assert.equal(res.status, 1);
  assert.ok(/--source\/--title only apply with --export/.test(res.stderr));
});

test("--export with --describe is refused as ambiguous", () => {
  const res = run(["--example", "masked-relay", "--describe", "--export", "x.html"]);
  assert.equal(res.status, 1);
  assert.ok(/not both/.test(res.stderr));
});

test("--export on a missing --source path fails loudly, writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdt-export-badsrc-"));
  const out = join(dir, "run.html");
  const res = run([
    "--example", "masked-relay",
    "--export", out,
    "--source", join(dir, "does-not-exist"),
  ]);
  assert.equal(res.status, 1, "bad --source → non-zero");
  assert.ok(!existsSync(out), "no half-export is left behind");
});

/**
 * Synthesize a minimal, CHAIN-VALID state-dir whose one node publishes
 * `report.html` — built from the same SDK primitives the real run path uses
 * (commitPublished → createReceipt → appendReceipt), so chain-verify passes
 * for real, not by mocking. Shared by the html-preview and tamper tests.
 */
function synthesizeHtmlStateDir(stateDir: string, assetHtml: string): void {
  const store = createFileSystemWorldModelStore({
    directory: join(stateDir, "world-models"),
  });
  const commit = store.commitPublished("responsibility.page-renderer", {
    "report.html": new TextEncoder().encode(assetHtml),
  });
  const fp = (s: string): string =>
    `sha256:${createHash("sha256").update(s).digest("hex")}`;
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  storage.appendReceipt(
    createReceipt({
      node: "responsibility.page-renderer",
      contract_fingerprint: fp("contract"),
      wake: { source: "external", refs: [] },
      input_fingerprints: [fp("input")],
      fingerprints: commit.fingerprints,
      semantic_diff: {},
      prev: null,
      status: "rendered",
      cost: {
        provider: "demo",
        model: "demo",
        tokens: { fresh: 100, reused: 0 },
        surprise_cause: "external",
      },
      sig: createNullSignature(),
    }),
  );
  mkdirSync(join(stateDir, "compile"), { recursive: true });
  writeFileSync(
    join(stateDir, "compile", "topology.json"),
    JSON.stringify({
      nodes: [{ node: "responsibility.page-renderer" }],
      edges: [],
      entry_points: ["responsibility.page-renderer"],
      acyclic: true,
    }),
  );
}

test("--export previews an .html world-model asset in a sandboxed iframe", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-export-html-"));
  const hostileHtml =
    "<!doctype html><h1>Weekly signal report</h1><script>alert(1)</script>";
  synthesizeHtmlStateDir(stateDir, hostileHtml);

  const out = join(stateDir, "run.html");
  const res = run([stateDir, "--export", out]);
  assert.equal(res.status, 0, `chain-valid synthetic dir exports clean (stderr: ${res.stderr})`);
  const html = readFileSync(out, "utf8");
  assert.ok(html.includes("report.html"), "the asset filename renders");
  assert.ok(
    html.includes(`<iframe class="preview" sandbox=""`),
    "the .html asset previews in a NO-TOKEN sandboxed iframe (scripts blocked)",
  );
  assert.ok(
    html.includes("srcdoc=\"&lt;!doctype html&gt;"),
    "the srcdoc attribute is HTML-escaped",
  );
  assert.ok(
    !html.includes("<script>alert(1)</script>"),
    "the hostile asset script never appears live in the export document",
  );
  assert.ok(html.includes("view source"), "the escaped source sits under the preview");
  // The open-in-tab affordance: a button wired to the embedded source by id,
  // typed text/html, backed by the blob: handler in the inline script. It must
  // sit ON THE SUMMARY ROW — visible while the node is still collapsed, not
  // buried inside the expanded body.
  assert.ok(
    /<button class="open" data-open="asset-\d+" data-type="text\/html">open in tab<\/button><\/summary>/.test(html),
    "an .html asset gets an open-in-tab button on the collapsed summary row",
  );
  const openId = /data-open="(asset-\d+)"/.exec(html)?.[1];
  assert.ok(openId !== undefined && html.includes(`<pre id="${openId}">`),
    "the button's data-open id resolves to the embedded source pre");
  assert.ok(html.includes("URL.createObjectURL"), "the blob open handler ships inline");
  assert.ok(html.includes(`window.open(url, "_blank", "noopener")`),
    "the artifact tab is detached from the export page (noopener)");
});

test("--export on a TAMPERED ledger exits 1 but still writes the verdict-bearing file", () => {
  // The documented honesty contract: tamper → exit 1, file still written and
  // carrying the tamper verdict (an export that shows the broken chain beats
  // no export). Tamper = edit a receipt field on disk WITHOUT re-stamping its
  // content_hash, exactly what chain-verify against the raw trail must catch.
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-export-tamper-"));
  synthesizeHtmlStateDir(stateDir, "<!doctype html><h1>ok</h1>");
  const trail = join(stateDir, "receipts.json");
  writeFileSync(
    trail,
    readFileSync(trail, "utf8").replace(
      "responsibility.page-renderer",
      "responsibility.evil-twin",
    ),
  );

  const out = join(stateDir, "run.html");
  const res = run([stateDir, "--export", out]);
  assert.equal(res.status, 1, "detected tamper → exit 1");
  assert.ok(/CHAIN-VERIFY FAILED/.test(res.stdout), "stdout names the failure");
  assert.ok(existsSync(out), "the file is STILL written");
  const html = readFileSync(out, "utf8");
  assert.ok(html.includes("chain ✗ TAMPERED"), "the tamper badge renders");
  assert.ok(html.includes("CHAIN-VERIFY FAILED"), "the per-node errors render");
});

test("--export/--source/--title with a missing value refuse before any mode dispatch", () => {
  // bug#6 family: a bare `--export` must NEVER fall through to the blocking
  // server, and `--export --force` must never write a file named `--force`.
  const bare = run(["--example", "masked-relay", "--export"]);
  assert.equal(bare.status, 1, "bare --export exits 1, never binds a port");
  assert.ok(/missing a value: --export/.test(bare.stderr), "names the flag");
  const eaten = run(["--example", "masked-relay", "--export", "--force"]);
  assert.equal(eaten.status, 1, "--export followed by a flag exits 1");
  assert.ok(/missing a value: --export/.test(eaten.stderr));
});

test("--source matching no *.prose.md files fails loudly, writes nothing", () => {
  // An explicit --source that yields zero sources is a caller mistake (typo'd
  // dir), not a legitimate no-contract run — never a quiet contract-less export.
  const dir = mkdtempSync(join(tmpdir(), "rdt-export-emptysrc-"));
  mkdirSync(join(dir, "not-prose"));
  writeFileSync(join(dir, "not-prose", "notes.md"), "not a contract");
  const out = join(dir, "run.html");
  const res = run([
    "--example", "masked-relay",
    "--export", out,
    "--source", join(dir, "not-prose"),
  ]);
  assert.equal(res.status, 1, "empty --source → non-zero");
  assert.ok(/matched no \*\.prose\.md files/.test(res.stderr), "names the problem");
  assert.ok(!existsSync(out), "no half-export is left behind");
});

// --- unit level --------------------------------------------------------------

test("collectSources: a single file, a dir, and the src/ child convention", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdt-collect-"));
  writeFileSync(join(dir, "zeta.prose.md"), "z");
  writeFileSync(join(dir, "index.prose.md"), "i");
  writeFileSync(join(dir, "notes.md"), "not prose"); // ignored: wrong extension
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "alpha.prose.md"), "a");

  const single = collectSources(join(dir, "zeta.prose.md"), "/nowhere");
  assert.deepEqual(single.map((s) => s.name), ["zeta.prose.md"]);

  const fromDir = collectSources(dir, "/nowhere");
  assert.deepEqual(
    fromDir.map((s) => s.name),
    ["index.prose.md", "alpha.prose.md", "zeta.prose.md"],
    "index.prose.md first, then alphabetical; src/ child included; .md ignored",
  );
});

test("renderRunExport: chainOk mirrors --describe and sources count through", () => {
  const opened = openStateDir(MASKED_RELAY);
  const result = renderRunExport(opened, { synthetic: true });
  assert.equal(result.chainOk, true, "the shipped fixture chain-verifies");
  assert.equal(result.sourceCount, 0, "a reactor state-dir has no source snapshot");
  assert.ok(result.html.includes("synthetic sample ledger"),
    "the synthetic banner renders in the document");
  // Self-containment: no external fetches of any kind.
  assert.ok(!/src=["']https?:/.test(result.html), "no external src= URLs");
  assert.ok(!/href=["']https?:/.test(result.html), "no external href= URLs");
});
