// The EXPORT surface — `reactor-devtools <state-dir> --export <file.html>`.
//
// One self-contained, dependency-free HTML file bundling the three faces of a
// run the way a gist bundles a snippet (the "gist view"):
//
//   1. CONTRACT — the `.prose.md` source(s), copyable verbatim (the part a
//      reader pastes into their own tree to re-run).
//   2. RUN — the receipt timeline (the full run artifact), collapsed by
//      default: per-frame dispositions, moved facets, per-node chain-verify,
//      the cost rollup, and the raw as-persisted receipts.
//   3. OUTPUTS — each node's published world-model at its LAST rendered
//      version (the assets the run actually produced).
//
// Everything here is a PURE FORMATTER over the same data layer the SPA and
// `--describe` consume (`openStateDir` → `buildSnapshot` / `describeStateDir` /
// `readNodeWorldModel`) — nothing is re-derived. The output file embeds no
// external assets and runs no network requests; the inline script contains
// exactly two handlers: copy-to-clipboard, and the open-in-tab blob handler
// (which DOES run an asset live in an isolated origin on an explicit click —
// see the OPEN note on the script). All embedded text (sources, receipts,
// world-model files) is HTML-escaped, and the inline `.html` previews stay
// inside a no-token sandboxed `srcdoc` iframe (scripts blocked), so a hostile
// world-model file cannot run code in the export page itself.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

import {
  buildSnapshot,
  describeStateDir,
  readNodeWorldModel,
  type OpenedStateDir,
  type ReplaySnapshot,
  type DescribeData,
  type WorldModelFileView,
} from "../data";

/** One embedded `.prose.md` source file (the copyable contract block). */
export interface SourceFile {
  /** Display name (the basename, e.g. `signal-inbox.prose.md`). */
  readonly name: string;
  /** The verbatim file text. */
  readonly text: string;
}

/** One node's published outputs at its last rendered version. */
export interface NodeOutput {
  readonly node: string;
  readonly label: string;
  /** The content-addressed version exported (= last rendered `@atomic`). */
  readonly version: string;
  readonly files: readonly WorldModelFileView[];
}

export interface RunExportOptions {
  /** Page title; defaults to the beats title, else the state-dir basename. */
  readonly title?: string;
  /** Shipped sample (`--example`) — stamps the illustrative-figures banner. */
  readonly synthetic?: boolean;
  /**
   * `--source <path>`: a `.prose.md` file or a directory of them to embed as
   * the contract block. When omitted, the exporter auto-detects a source
   * snapshot INSIDE the state-dir (`root.prose.md` / `sources/*.prose.md`, the
   * VM run-envelope convention) and embeds nothing if there is none.
   */
  readonly sourcePath?: string;
}

export interface RunExportResult {
  /** The complete, self-contained HTML document. */
  readonly html: string;
  /** Mirror of the `--describe` chain-verify verdict (drives the exit code). */
  readonly chainOk: boolean;
  /** How many source files were embedded (0 = no contract block). */
  readonly sourceCount: number;
}

/** Raw-receipts JSON above this byte size is omitted from the export (with an
 * honest note) so a huge ledger cannot balloon the artifact. */
const RAW_RECEIPTS_BYTE_CAP = 4 * 1024 * 1024;

const PROSE_EXT = ".prose.md";

/**
 * Collect the `.prose.md` sources to embed. Explicit `sourcePath` wins: a file
 * embeds that file; a directory embeds every `*.prose.md` directly inside it
 * AND inside a conventional `src/` child (the example-package layout). With no
 * `sourcePath`, fall back to a source snapshot inside the state-dir itself —
 * `root.prose.md` plus `sources/*.prose.md` (the VM run-envelope convention;
 * reactor state-dirs do not write these today, so this is forward-compat).
 * `index.prose.md` sorts first; the rest alphabetical.
 */
export function collectSources(
  sourcePath: string | undefined,
  stateDir: string,
): SourceFile[] {
  const out: SourceFile[] = [];
  const pushFile = (path: string): void => {
    out.push({ name: basename(path), text: readFileSync(path, "utf8") });
  };
  const pushDirProse = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith(PROSE_EXT)) pushFile(join(dir, name));
    }
  };

  if (sourcePath !== undefined) {
    const st = statSync(sourcePath); // missing path throws — caller surfaces it
    if (st.isFile()) {
      pushFile(sourcePath);
    } else {
      pushDirProse(sourcePath);
      pushDirProse(join(sourcePath, "src"));
    }
    // An explicit --source that matches NOTHING is a caller mistake (typo'd or
    // wrong dir), not a no-contract run — fail loudly before any file is
    // written rather than shipping a quiet contract-less export.
    if (out.length === 0) {
      throw new Error(
        `--source matched no *.prose.md files at ${sourcePath} (looked in it and its src/ child)`,
      );
    }
  } else {
    const root = join(stateDir, "root.prose.md");
    if (existsSync(root)) pushFile(root);
    pushDirProse(join(stateDir, "sources"));
  }

  out.sort((a, b) =>
    a.name === "index.prose.md" ? -1
    : b.name === "index.prose.md" ? 1
    : a.name.localeCompare(b.name),
  );
  return out;
}

/**
 * Collect each node's published world-model at its LAST `rendered` version —
 * the run's output assets. Ordered by topology node order (receipt-only nodes
 * like `ingress.*` follow, first-seen). Nodes whose version cannot be read
 * back (no `world-models/` dir, pruned version) are silently absent — the
 * outputs section says so rather than fabricating content.
 */
export function collectOutputs(
  opened: OpenedStateDir,
  snapshot: ReplaySnapshot,
): NodeOutput[] {
  const lastRendered = new Map<string, string>();
  for (const f of snapshot.frames) {
    if (f.status === "rendered" && f.atomicVersion !== "") {
      lastRendered.set(f.node, f.atomicVersion);
    }
  }
  const order: string[] = snapshot.nodes.map((n) => n.id);
  for (const node of lastRendered.keys()) {
    if (!order.includes(node)) order.push(node);
  }
  const out: NodeOutput[] = [];
  for (const node of order) {
    const version = lastRendered.get(node);
    if (version === undefined) continue;
    const wm = readNodeWorldModel(opened, node, version);
    if (wm === null) continue;
    out.push({ node, label: labelFor(snapshot, node), version, files: wm.files });
  }
  return out;
}

/** Friendly label with the same fallback `--describe` uses (short name). */
function labelFor(snapshot: ReplaySnapshot, node: string): string {
  const l = snapshot.labels[node];
  if (l) return l;
  const dot = node.indexOf(".");
  return dot >= 0 ? node.slice(dot + 1) : node;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pretty-print a text body when it parses as JSON; otherwise return as-is. */
function prettyMaybeJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function fmtTokens(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Render the gist-view export for an opened state-dir. Pure over the data
 * layer; the caller writes `result.html` to disk and maps `result.chainOk`
 * onto the exit code exactly like `--describe`.
 */
export function renderRunExport(
  opened: OpenedStateDir,
  options: RunExportOptions = {},
): RunExportResult {
  const snapshot = buildSnapshot(opened);
  const describe = describeStateDir(opened, {
    synthetic: options.synthetic ?? false,
  });
  const data = describe.data;
  const sources = collectSources(options.sourcePath, opened.stateDir);
  const outputs = collectOutputs(opened, snapshot);
  const title =
    options.title ??
    (snapshot.beats?.title || basename(opened.stateDir) || "reactor run");

  const html = renderDocument({
    title,
    synthetic: options.synthetic ?? false,
    snapshot,
    data,
    describeText: describe.text,
    rawReceipts: opened.rawReceipts,
    sources,
    outputs,
  });
  return { html, chainOk: describe.chainOk, sourceCount: sources.length };
}

// --- the document ------------------------------------------------------------

interface DocumentInput {
  readonly title: string;
  readonly synthetic: boolean;
  readonly snapshot: ReplaySnapshot;
  readonly data: DescribeData;
  readonly describeText: string;
  readonly rawReceipts: readonly unknown[] | null;
  readonly sources: readonly SourceFile[];
  readonly outputs: readonly NodeOutput[];
}

function renderDocument(input: DocumentInput): string {
  const { title, synthetic, snapshot, data, sources, outputs } = input;
  const chainBadge = data.chainVerify.ok
    ? `<span class="badge ok">chain ✓ verified</span>`
    : `<span class="badge bad">chain ✗ TAMPERED</span>`;
  const stats =
    `${data.topology.nodes} nodes · ${data.topology.edges} edges · ` +
    `${data.receipts} receipts — rendered ${data.dispositions.rendered} · ` +
    `skipped ${data.dispositions.skipped} · failed ${data.dispositions.failed} — ` +
    `fresh ${fmtTokens(data.costRollup.total.fresh)} tokens`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — reactor run</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(stats)} ${chainBadge}</p>
  <p class="meta dim">state-dir ${escapeHtml(basename(snapshot.stateDir) || snapshot.stateDir)}</p>
  ${synthetic ? `<p class="meta synthetic">synthetic sample ledger — token counts are illustrative, not a bill</p>` : ""}
</header>
${renderContractSection(sources)}
${renderRunSection(input)}
${renderOutputsSection(outputs)}
<footer>generated by <code>reactor-devtools --export</code> · self-contained · no network</footer>
<script>${COPY_SCRIPT}</script>
</body>
</html>
`;
}

// §1 CONTRACT — the copyable prose block(s).
function renderContractSection(sources: readonly SourceFile[]): string {
  if (sources.length === 0) {
    return `<section>
  <h2>Contract</h2>
  <p class="dim">No <code>.prose.md</code> source embedded — the state-dir carries no source
  snapshot. Re-export with <code>--source &lt;file-or-dir&gt;</code> to include the contract.</p>
</section>`;
  }
  const blocks = sources
    .map((s, i) => {
      const id = `src-${i}`;
      return `<details class="src"${sources.length === 1 ? " open" : ""}>
  <summary><code>${escapeHtml(s.name)}</code><button class="copy" data-copy="${id}">copy</button></summary>
  <pre id="${id}"><code>${escapeHtml(s.text)}</code></pre>
</details>`;
    })
    .join("\n");
  return `<section>
  <h2>Contract <span class="dim">— ${sources.length} source file${sources.length === 1 ? "" : "s"}, copy &amp; re-run with <code>prose run</code> / <code>reactor run</code></span></h2>
${blocks}
</section>`;
}

// §2 RUN — the expandable full run artifact.
function renderRunSection(input: DocumentInput): string {
  const { snapshot, data } = input;

  if (data.empty) {
    return `<section>
  <h2>Run</h2>
  <p class="dim">Ledger empty — this state-dir is compiled-but-unrun.</p>
</section>`;
  }

  const frameRows = data.frames
    .map(
      (f) => `<tr class="${escapeHtml(f.status)}">
  <td class="num">${f.index}</td>
  <td>${escapeHtml(f.label)}</td>
  <td class="status">${escapeHtml(f.status)}</td>
  <td>${escapeHtml(f.wakeSource)}</td>
  <td>${escapeHtml(f.movedFacets.join(", ") || "—")}</td>
  <td class="num">${fmtTokens(f.fresh)}</td>
  <td>${escapeHtml(f.wokenSubscribers.join(", ") || "—")}</td>
</tr>`,
    )
    .join("\n");

  const nodeRows = data.nodes
    .map(
      (n) => `<tr>
  <td>${escapeHtml(n.label)}${n.offTopology ? ` <span class="bad-text">(off-topology)</span>` : ""}</td>
  <td class="num">${n.rendered}</td>
  <td class="num">${n.skipped}</td>
  <td class="num">${n.failed}</td>
  <td class="num">${fmtTokens(n.fresh)}</td>
  <td>${n.chainOk ? `<span class="ok-text">chain ✓</span>` : `<span class="bad-text">chain ✗</span>`}</td>
</tr>`,
    )
    .join("\n");

  const costRows = Object.entries(data.costRollup.bySurpriseCause)
    .filter(([, b]) => b.receipts > 0)
    .map(
      ([cause, b]) => `<tr>
  <td>${escapeHtml(cause)}</td>
  <td class="num">${b.receipts}</td>
  <td class="num">${fmtTokens(b.fresh)}</td>
  <td class="num">${fmtTokens(b.reused)}</td>
</tr>`,
    )
    .join("\n");

  const edgeList = snapshot.edges
    .map(
      (e) =>
        `<li><code>${escapeHtml(e.producer)}</code> —<span class="facet">${escapeHtml(e.facet)}</span>→ <code>${escapeHtml(e.subscriber)}</code></li>`,
    )
    .join("\n");

  const chainErrors = data.chainVerify.ok
    ? ""
    : `<div class="tamper"><strong>CHAIN-VERIFY FAILED</strong><ul>${data.chainVerify.errors
        .map((e) => `<li>${escapeHtml(e)}</li>`)
        .join("")}</ul></div>`;

  // The raw as-persisted receipts: the deepest layer of the artifact. Capped so
  // a huge ledger cannot balloon the file — the cap is NAMED in the output.
  let rawBlock = `<p class="dim">raw trail unavailable</p>`;
  if (input.rawReceipts !== null) {
    const rawJson = JSON.stringify(input.rawReceipts, null, 2);
    rawBlock =
      Buffer.byteLength(rawJson, "utf8") <= RAW_RECEIPTS_BYTE_CAP
        ? `<pre><code>${escapeHtml(rawJson)}</code></pre>`
        : `<p class="dim">omitted — raw receipts exceed ${RAW_RECEIPTS_BYTE_CAP / (1024 * 1024)} MB; read them from the state-dir's <code>receipts.json</code></p>`;
  }

  return `<section>
  <h2>Run <span class="dim">— receipt timeline, expand for the full artifact</span></h2>
  ${chainErrors}
  <details>
    <summary>${data.receipts} receipts · rendered ${data.dispositions.rendered} / skipped ${data.dispositions.skipped} / failed ${data.dispositions.failed} · ${data.chainVerify.ok ? "chain ✓" : "chain ✗"}</summary>
    <h3>Frames</h3>
    <table>
      <thead><tr><th>#</th><th>node</th><th>status</th><th>wake</th><th>moved facets</th><th>fresh tokens</th><th>woke</th></tr></thead>
      <tbody>
${frameRows}
      </tbody>
    </table>
    <h3>Per node</h3>
    <table>
      <thead><tr><th>node</th><th>rendered</th><th>skipped</th><th>failed</th><th>fresh tokens</th><th>chain</th></tr></thead>
      <tbody>
${nodeRows}
      </tbody>
    </table>
    <h3>Cost by surprise-cause</h3>
    <table>
      <thead><tr><th>cause</th><th>receipts</th><th>fresh tokens</th><th>reused tokens</th></tr></thead>
      <tbody>
${costRows}
      </tbody>
    </table>
    <details>
      <summary>Topology — ${snapshot.edges.length} subscription edges</summary>
      <ul class="edges">
${edgeList}
      </ul>
    </details>
    <details>
      <summary>Raw receipts (as persisted, chain-verifiable)</summary>
      ${rawBlock}
    </details>
  </details>
</section>`;
}

// §3 OUTPUTS — each node's published truth at its last rendered version.
function renderOutputsSection(outputs: readonly NodeOutput[]): string {
  if (outputs.length === 0) {
    return `<section>
  <h2>Outputs</h2>
  <p class="dim">No published world-models readable from this state-dir
  (no <code>world-models/</code> directory, or no rendered receipts).</p>
</section>`;
  }
  let assetId = 0;
  const blocks = outputs
    .map((o) => {
      // Pre-assign the per-file source ids so the SUMMARY can carry the
      // open-in-tab button(s) for previewable assets — the affordance must be
      // visible while the node is still COLLAPSED (the embedded source the
      // button reads lives in the DOM either way). One asset → the plain
      // label; several → each button names its file.
      const ids = o.files.map(() => `asset-${assetId++}`);
      const previewable = o.files
        .map((f, i) => ({ f, id: ids[i]! }))
        .filter(({ f }) => f.text !== null && isPreviewableAsset(f.path));
      const openButtons = previewable
        .map(
          ({ f, id }) =>
            `<button class="open" data-open="${id}" data-type="${assetContentType(f.path)}">${
              previewable.length === 1 ? "open in tab" : `open ${escapeHtml(f.path)}`
            }</button>`,
        )
        .join("");
      const files = o.files
        .map((f, i) => renderOutputFile(o.node, f, ids[i]!))
        .join("\n");
      return `<details class="out">
  <summary><code>${escapeHtml(o.label)}</code> <span class="dim">${o.files.length} file${o.files.length === 1 ? "" : "s"} @ ${escapeHtml(shortAddress(o.version))}</span>${openButtons}</summary>
${files}
</details>`;
    })
    .join("\n");
  return `<section>
  <h2>Outputs <span class="dim">— published world-model at each node's last rendered version</span></h2>
${blocks}
</section>`;
}

/** `sha256:ab12…ef34` — keep addresses scannable. */
function shortAddress(version: string): string {
  const m = /^(sha256:)([0-9a-f]{64})$/.exec(version);
  return m ? `${m[1]}${m[2]!.slice(0, 8)}…` : version;
}

/** Assets that get a live preview + open-in-tab: HTML documents and SVG. */
function isPreviewableAsset(path: string): boolean {
  return /\.(html?|svg)$/i.test(path);
}

/** The blob content-type the open-in-tab button stamps on the asset. */
function assetContentType(path: string): string {
  return /\.svg$/i.test(path) ? "image/svg+xml" : "text/html";
}

function renderOutputFile(
  node: string,
  f: WorldModelFileView,
  assetId: string,
): string {
  const heading = `<p class="filepath"><code>${escapeHtml(f.path)}</code> <span class="dim">${f.bytes} B</span></p>`;
  if (f.text === null) {
    return `${heading}<p class="dim">binary — base64 in the state-dir's world-models/</p>`;
  }
  // An HTML/SVG asset gets a sandboxed live preview (no scripts — the sandbox
  // attribute with no tokens blocks JS, forms, and top navigation) PLUS the
  // escaped source underneath; its open-in-tab button lives on the NODE's
  // summary row (visible while collapsed) and points here via `assetId` (see
  // the OPEN note on the script for the trust boundary). Everything else
  // renders as escaped text.
  if (isPreviewableAsset(f.path)) {
    return `${heading}
<iframe class="preview" sandbox="" title="${escapeHtml(node)}/${escapeHtml(f.path)}" srcdoc="${escapeHtml(f.text)}"></iframe>
<details><summary>view source</summary><pre id="${assetId}"><code>${escapeHtml(f.text)}</code></pre></details>`;
  }
  return `${heading}<pre><code>${escapeHtml(prettyMaybeJson(f.text))}</code></pre>`;
}

// --- inline assets -----------------------------------------------------------

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 2rem 1.25rem 4rem; max-width: 60rem;
  background: #0b0e14; color: #d7dce2;
  font: 14px/1.55 "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
h1 { font-size: 1.25rem; margin: 0 0 .25rem; color: #fff; }
h2 { font-size: 1rem; margin: 2.25rem 0 .75rem; color: #fff; border-bottom: 1px solid #1e2430; padding-bottom: .4rem; }
h3 { font-size: .85rem; margin: 1.25rem 0 .4rem; color: #aeb7c2; text-transform: uppercase; letter-spacing: .06em; }
.meta { margin: .15rem 0; font-size: .8rem; color: #aeb7c2; }
.dim { color: #6b7585; font-weight: normal; font-size: .8rem; }
.synthetic { color: #d9a64a; }
.badge { padding: .1rem .5rem; border-radius: 99px; font-size: .75rem; vertical-align: middle; }
.badge.ok { background: #103822; color: #57d98a; }
.badge.bad { background: #3d1216; color: #ff6b6b; }
.ok-text { color: #57d98a; }
.bad-text { color: #ff6b6b; }
section { margin-top: 1.5rem; }
details { border: 1px solid #1e2430; border-radius: 8px; margin: .5rem 0; background: #0e121a; }
details > summary { cursor: pointer; padding: .55rem .8rem; color: #c8d0da; user-select: none; }
details[open] > summary { border-bottom: 1px solid #1e2430; }
details > *:not(summary) { margin: .6rem .8rem; }
details details { margin: .6rem .8rem; }
pre { overflow-x: auto; padding: .75rem; background: #0a0d13; border-radius: 6px; font-size: .8rem; line-height: 1.5; }
code { font-family: inherit; }
table { border-collapse: collapse; width: 100%; font-size: .78rem; }
th, td { text-align: left; padding: .25rem .55rem; border-bottom: 1px solid #161b25; vertical-align: top; }
th { color: #6b7585; font-weight: 500; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.rendered td.status { color: #57d98a; }
tr.skipped td { color: #5c6675; }
tr.skipped td.status { color: #5c6675; }
tr.failed td.status { color: #ff6b6b; }
.copy, .open {
  float: right; margin-left: .75rem; padding: .1rem .6rem; font: inherit; font-size: .72rem;
  background: #18202e; color: #c8d0da; border: 1px solid #28324a; border-radius: 6px; cursor: pointer;
}
.copy:hover, .open:hover { background: #21304a; }
.copy.done { color: #57d98a; border-color: #2a4a36; }
.filepath { margin: .75rem .8rem .25rem; }
.preview { width: 100%; height: 24rem; border: 1px solid #1e2430; border-radius: 6px; background: #fff; }
.edges { list-style: none; padding-left: .25rem; font-size: .78rem; }
.facet { color: #d9a64a; padding: 0 .2rem; }
.tamper { border: 1px solid #5c1a21; background: #1d0d10; border-radius: 8px; padding: .6rem .9rem; color: #ff8a8a; }
footer { margin-top: 3rem; font-size: .72rem; color: #4d5666; }
`;

const COPY_SCRIPT = `
for (const btn of document.querySelectorAll(".copy")) {
  btn.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const pre = document.getElementById(btn.getAttribute("data-copy"));
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      btn.textContent = "copied"; btn.classList.add("done");
      setTimeout(() => { btn.textContent = "copy"; btn.classList.remove("done"); }, 1200);
    });
  });
}
// OPEN: view an HTML/SVG asset in its own tab via a blob: URL built from the
// embedded source (pre.textContent un-escapes it). DELIBERATE trust boundary:
// the inline preview is a no-token sandbox (scripts blocked), while open-in-tab
// runs the artifact LIVE — an explicit user action, in an isolated blob origin
// detached from this page via noopener. Blob URLs are never revoked here: the
// artifact tab must survive reloads, and the cost is bounded by page lifetime.
for (const btn of document.querySelectorAll(".open")) {
  btn.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const pre = document.getElementById(btn.getAttribute("data-open"));
    if (!pre) return;
    const type = btn.getAttribute("data-type") || "text/html";
    const url = URL.createObjectURL(new Blob([pre.textContent], { type }));
    window.open(url, "_blank", "noopener");
  });
}
`;
