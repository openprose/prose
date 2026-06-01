// Reactor DevTools SPA — vanilla JS, no build step, no framework (plan §5.1).
//
// S1 (this build): a layered-DAG render of the saved topology (dark theme,
// entry-point gateways highlighted), an ordered receipt timeline, and a
// scrubber (play / pause / step / jump) that steps through the receipt frames
// marking which node each receipt hit. No flash animation yet — that is S2,
// which layers transient classes/keyframes onto the same DOM this file builds.
//
// The whole view is a pure function of the snapshot served at /api/state:
//   { nodes, edges, entryPoints, acyclic, frames, costRollup, hasTopology }
// (see src/data/index.ts for the exact shapes). We hold the snapshot, the
// derived layout, and a single scrub index; every render reads from those.

"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------------------
// Layout: longest-path layering of the DAG (Sugiyama layer assignment).
// The graph is guaranteed acyclic (topology.acyclic), so a simple longest-path
// pass gives a clean left→right layered layout: every node sits one layer to
// the right of its deepest producer. Within a layer, nodes are ordered by the
// barycenter of their producers' positions to reduce edge crossings.
// ---------------------------------------------------------------------------

function buildLayout(snapshot, geom) {
  // Collect every node referenced by topology.nodes OR by an edge endpoint —
  // a producer like `ingress.signal-inbox` can be an edge source without being
  // a listed topology node, and it still needs a box.
  const ids = new Set();
  const entry = new Set(snapshot.entryPoints);
  for (const n of snapshot.nodes) ids.add(n.id);
  for (const e of snapshot.edges) { ids.add(e.producer); ids.add(e.subscriber); }

  const listed = new Set(snapshot.nodes.map((n) => n.id));
  const producers = new Map(); // id -> [producer ids]
  const successors = new Map(); // id -> count of outgoing (for sink detection)
  for (const id of ids) { producers.set(id, []); successors.set(id, 0); }
  for (const e of snapshot.edges) {
    producers.get(e.subscriber).push(e.producer);
    successors.set(e.producer, successors.get(e.producer) + 1);
  }

  // Longest-path layer assignment via memoized DFS over producers.
  const layerOf = new Map();
  const visiting = new Set();
  function layer(id) {
    if (layerOf.has(id)) return layerOf.get(id);
    if (visiting.has(id)) return 0; // cycle guard (shouldn't happen on a DAG)
    visiting.add(id);
    const ps = producers.get(id) || [];
    let l = 0;
    for (const p of ps) l = Math.max(l, layer(p) + 1);
    visiting.delete(id);
    layerOf.set(id, l);
    return l;
  }
  for (const id of ids) layer(id);

  // Bucket nodes by layer.
  const layers = [];
  for (const id of ids) {
    const l = layerOf.get(id);
    (layers[l] || (layers[l] = [])).push(id);
  }

  // Order within each layer by the average index of producers in the previous
  // layer (barycenter heuristic) to keep edges short and crossings low.
  const orderInLayer = new Map();
  layers.forEach((bucket, li) => {
    if (li === 0) {
      bucket.sort(); // stable, deterministic seed
    } else {
      bucket.sort((a, b) => bary(a) - bary(b) || (a < b ? -1 : 1));
    }
    bucket.forEach((id, i) => orderInLayer.set(id, i));
  });
  function bary(id) {
    const ps = producers.get(id) || [];
    if (ps.length === 0) return 0;
    let sum = 0;
    for (const p of ps) sum += orderInLayer.has(p) ? orderInLayer.get(p) : 0;
    return sum / ps.length;
  }

  // Assign pixel coordinates. Columns are layers; rows are intra-layer order,
  // vertically centered per column.
  const { nodeW, nodeH, colGap, rowGap, padX, padY } = geom;
  const colStride = nodeW + colGap;
  const rowStride = nodeH + rowGap;
  const tallest = layers.reduce((m, b) => Math.max(m, b ? b.length : 0), 0);
  const totalH = tallest * rowStride - rowGap;

  const nodes = new Map();
  layers.forEach((bucket, li) => {
    if (!bucket) return;
    const colH = bucket.length * rowStride - rowGap;
    const yOffset = padY + (totalH - colH) / 2;
    bucket.forEach((id, ri) => {
      nodes.set(id, {
        id,
        layer: li,
        row: ri,
        x: padX + li * colStride,
        y: yOffset + ri * rowStride,
        w: nodeW,
        h: nodeH,
        isEntry: entry.has(id),
        isListed: listed.has(id),
      });
    });
  });

  const width = padX * 2 + (layers.length - 1) * colStride + nodeW;
  const height = padY * 2 + totalH;

  // Pre-route edges as cubic curves between right-edge of producer and
  // left-edge of subscriber, keyed for lane lighting in S2.
  const edges = snapshot.edges.map((e, i) => {
    const a = nodes.get(e.producer);
    const b = nodes.get(e.subscriber);
    return { ...e, key: edgeKey(e), idx: i, a, b };
  });

  return { nodes, edges, width: Math.max(width, 600), height: Math.max(height, 320) };
}

function edgeKey(e) {
  return e.producer + "→" + e.subscriber + "::" + e.facet;
}

// Friendly labels are DATA: the snapshot carries an optional `labels` map
// (read from the state-dir's `compile/labels.json`) so the viewer stays generic.
// When a node has a label we show it verbatim ("Claude Adapter"); otherwise we
// fall back to the structural short name. The kind prefix line is suppressed for
// labeled nodes (the label already reads as a name, not `responsibility.x`).
let LABELS = Object.create(null);
function setLabels(map) { LABELS = map || Object.create(null); }
function hasLabel(id) { return Object.prototype.hasOwnProperty.call(LABELS, id); }

function shortName(id) {
  // Prefer the friendly label; else `responsibility.viewport-masker` → `viewport-masker`.
  if (hasLabel(id)) return LABELS[id];
  const dot = id.indexOf(".");
  return dot >= 0 ? id.slice(dot + 1) : id;
}
function kindOf(id) {
  // Labeled nodes hide the structural kind prefix — the label is the whole name.
  if (hasLabel(id)) return "";
  const dot = id.indexOf(".");
  return dot >= 0 ? id.slice(0, dot) : "";
}

// ---------------------------------------------------------------------------
// SVG render of the layout (static structure; the scrubber only toggles
// classes on already-rendered nodes).
// ---------------------------------------------------------------------------

function el(name, attrs, children) {
  const node = document.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (children) for (const c of children) node.appendChild(c);
  return node;
}

function curvePath(a, b) {
  // From producer right edge to subscriber left edge, horizontal-tangent cubic.
  const x1 = a.x + a.w, y1 = a.y + a.h / 2;
  const x2 = b.x, y2 = b.y + b.h / 2;
  // Handle back-edges (subscriber left of producer) by bowing outward; the DAG
  // layering makes these rare but layout isn't a strict topological sort.
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx, c2x = x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1} ${c2x} ${y2} ${x2} ${y2}`;
}

function facetClass(facet) {
  return facet === "@atomic" ? "facet-atomic" : "facet-" + facet.replace(/[^a-z0-9_-]/gi, "_");
}

function renderGraph(svg, layout) {
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const defs = el("defs");
  // Arrowhead marker for edges.
  const marker = el("marker", {
    id: "arrow", viewBox: "0 0 8 8", refX: "7", refY: "4",
    markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse",
  }, [el("path", { d: "M0 0 L8 4 L0 8 z", fill: "#3a465e" })]);
  defs.appendChild(marker);
  svg.appendChild(defs);

  const edgeLayer = el("g", { class: "edges" });
  const edgeByKey = new Map();
  for (const e of layout.edges) {
    if (!e.a || !e.b) continue;
    const path = el("path", {
      class: "edge " + facetClass(e.facet),
      d: curvePath(e.a, e.b),
      "marker-end": "url(#arrow)",
      "data-key": e.key,
      "data-producer": e.producer,
      "data-subscriber": e.subscriber,
      "data-facet": e.facet,
    });
    edgeLayer.appendChild(path);
    edgeByKey.set(e.key, path);
  }
  svg.appendChild(edgeLayer);

  const nodeLayer = el("g", { class: "nodes" });
  const nodeById = new Map();
  for (const n of layout.nodes.values()) {
    const cls = ["node", "untouched"];
    if (n.isEntry) cls.push("entry");
    if (!n.isListed) cls.push("producer-only");
    const g = el("g", { class: cls.join(" "), "data-node": n.id, transform: `translate(${n.x} ${n.y})` });
    // Halo rect sits UNDER the box; the S2 flash/skip/fail/woken pulses animate it.
    // Slightly inset so a scale-up reads as an outward bloom around the box.
    g.appendChild(el("rect", { class: "node-halo", x: -3, y: -3, width: n.w + 6, height: n.h + 6, rx: 12 }));
    g.appendChild(el("rect", { class: "node-box", x: 0, y: 0, width: n.w, height: n.h, rx: 9 }));
    const kind = kindOf(n.id);
    if (kind) g.appendChild(el("text", { class: "node-sub", x: 15, y: 21 }, [txt(kind)]));
    const name = shortName(n.id);
    const labelAttrs = { class: "node-label", x: 15, y: kind ? n.h - 21 : n.h / 2 };
    // Friendly labels ("Session Summary [claudeA]") are longer and proportional;
    // clamp them to the box width so they never spill. Structural short names sit
    // a hair larger (monospace ≈ 0.6em/char). Estimate per-glyph at the label's
    // own font-size so the clamp is tight but not crushing.
    const fontPx = hasLabel(n.id) ? 14.5 : 18;
    const usable = n.w - 28;
    const est = name.length * fontPx * 0.58;
    if (hasLabel(n.id)) labelAttrs.class += " labeled";
    if (est > usable) {
      labelAttrs.textLength = String(usable);
      labelAttrs.lengthAdjust = "spacingAndGlyphs";
    }
    const label = el("text", labelAttrs, [txt(name)]);
    g.appendChild(label);
    nodeLayer.appendChild(g);
    nodeById.set(n.id, g);
  }
  svg.appendChild(nodeLayer);

  return { edgeByKey, nodeById };
}

function txt(s) { return document.createTextNode(s); }

// ---------------------------------------------------------------------------
// Timeline (receipt list).
// ---------------------------------------------------------------------------

function renderTimeline(listEl, frames) {
  listEl.innerHTML = "";
  const items = [];
  for (const f of frames) {
    const li = document.createElement("li");
    li.className = `ritem s-${f.status} c-${f.cost.surpriseCause}`;
    li.dataset.index = String(f.index);
    li.innerHTML =
      `<span class="idx">${f.index}</span>` +
      `<span class="tick"></span>` +
      `<span class="name">${escapeHtml(shortName(f.node))}</span>` +
      `<span class="cause c-${f.cost.surpriseCause}">${f.cost.surpriseCause}</span>`;
    listEl.appendChild(li);
    items.push(li);
  }
  return items;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------------
// Cost meter (S1: cumulative fresh/reused up to the scrub head, by cause).
// S2 turns the per-frame series into a sparkline; the totals logic is shared.
// ---------------------------------------------------------------------------

function cumulativeCost(frames, upto) {
  const causes = { input: blank(), self: blank(), external: blank() };
  const total = blank();
  for (let i = 0; i <= upto && i < frames.length; i++) {
    const f = frames[i];
    const b = causes[f.cost.surpriseCause] || (causes[f.cost.surpriseCause] = blank());
    b.fresh += f.cost.fresh; b.reused += f.cost.reused; b.receipts += 1;
    total.fresh += f.cost.fresh; total.reused += f.cost.reused; total.receipts += 1;
  }
  return { causes, total };
  function blank() { return { fresh: 0, reused: 0, receipts: 0 }; }
}

// The HERO number is the RECENT-WINDOW fresh spend (review #5): the fresh tokens
// burned in the last SPARK_WINDOW frames up to the head. This is what makes the
// meter read "near zero / quiet" on the dim beats and tick ONCE on a surprise —
// the cumulative total (which only ever climbs) is demoted to a secondary line.
function windowFresh(frames, upto, win) {
  if (upto < 0) return { fresh: 0, reused: 0 };
  const start = Math.max(0, upto - (win - 1));
  let fresh = 0, reused = 0;
  for (let i = start; i <= upto && i < frames.length; i++) {
    fresh += frames[i].cost.fresh;
    reused += frames[i].cost.reused;
  }
  return { fresh, reused };
}

function renderMeter(meterEl, frames, upto, grandTotal) {
  const { causes, total } = cumulativeCost(frames, upto);
  const recent = windowFresh(frames, upto, SPARK_WINDOW);
  const sum = recent.fresh + recent.reused;
  const freshPct = sum > 0 ? (recent.fresh / sum) * 100 : 0;
  const reusedPct = 100 - freshPct;
  const grand = grandTotal.fresh + grandTotal.reused;
  const savedPct = grand > 0 ? Math.round((grandTotal.reused / grand) * 100) : 0;

  const causeRows = ["external", "input", "self"]
    .filter((c) => causes[c] && causes[c].receipts > 0)
    .map((c) => {
      const b = causes[c];
      return `<div class="meter-cause">` +
        `<span class="cause-name"><span class="dot dot-${c}"></span>${c}</span>` +
        `<span>${fmt(b.fresh)} fresh</span>` +
        `<span class="dim">${fmt(b.reused)} reused</span>` +
        `</div>`;
    }).join("");

  // A "quiet" class when the recent window is flat near zero, so the hero number
  // visibly cools (greys) on the boring beats and only burns orange on a spend.
  const quiet = recent.fresh < 600;
  meterEl.innerHTML =
    `<div class="meter-total"><span class="big${quiet ? " quiet" : ""}">${fmt(recent.fresh)}</span>` +
    `<span class="unit">fresh tokens · recent</span></div>` +
    `<div class="meter-bar">` +
    `<span class="seg-fresh" style="width:${freshPct}%"></span>` +
    `<span class="seg-reused" style="width:${reusedPct}%"></span></div>` +
    `<div class="meter-rows">` +
    `<div class="meter-row"><span class="swatch fresh"></span><span class="k">fresh · recent</span><span class="v">${fmt(recent.fresh)}</span></div>` +
    `<div class="meter-row"><span class="swatch reused"></span><span class="k">reused · recent</span><span class="v">${fmt(recent.reused)}</span></div>` +
    `</div>` +
    (causeRows ? `<div class="meter-causes">${causeRows}</div>` : "") +
    `<div class="meter-causes"><div class="meter-cause"><span class="cause-name dim">replay total · ${fmt(total.fresh)} fresh · ${savedPct}% reused</span><span class="dim">${fmt(grandTotal.fresh)} / ${fmt(grandTotal.reused)}</span><span></span></div></div>`;
}

function fmt(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

// ---------------------------------------------------------------------------
// Sparkline (S2): fresh tokens per receipt, colored by surprise_cause, with a
// faint reused underlay and a moving playhead. The fresh series is the hero —
// flat near zero while the world is quiet, a tall spike on a surprise. Built
// once as static SVG; per-scrub we only move the playhead and dim future bars,
// and a per-step spike pulse highlights the bar that just fired.
// ---------------------------------------------------------------------------

const SPARK_W = 280;
const SPARK_H = 64;
// The sparkline is a SLIDING WINDOW (review #4): it shows only the most recent
// WINDOW frames up to the scrub head and rescales to THAT window's peak. This is
// the fix for the "flat → single tick" read — the cold-boot cascade (which has
// its own tall clusterer spike) scrolls off the left as the head advances, so by
// the quiet beats the window is genuinely flat near zero, and when the expensive
// clusterer finally fires it is the one isolated tall tick in view. The window is
// wide enough to hold a whole beat's cascade but not the entire 74-frame run.
const SPARK_WINDOW = 12;

function buildSpark(svg, frames) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${SPARK_W} ${SPARK_H}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const n = frames.length;
  const peakFresh = frames.reduce((m, f) => Math.max(m, f.cost.fresh), 0);
  const padBottom = 4;
  const usableH = SPARK_H - padBottom - 4;
  const y0 = SPARK_H - padBottom;
  const win = Math.min(SPARK_WINDOW, Math.max(1, n));
  const barW = SPARK_W / win;
  const innerW = Math.max(1, Math.min(barW - 1.5, barW * 0.66));

  // The window is [start, head] inclusive, `win` bars wide. The fresh scale is
  // the window's OWN peak (so a quiet window reads flat and a window containing
  // the clusterer spike reads as one tall tick) — but floored so a lone routine
  // 540-fresh tick in an otherwise-empty window doesn't balloon to full height.
  const FRESH_SCALE_FLOOR = 1800;

  // Layers (rebuilt per setHead): a reused underlay, fresh bars, the silhouette,
  // and the playhead. We hold a <g> we can clear and repaint each time the head
  // moves, since which frames are visible (and the scale) change with the head.
  const layer = el("g", {});
  svg.appendChild(layer);
  svg.appendChild(el("line", { class: "spark-baseline", x1: 0, y1: y0, x2: SPARK_W, y2: y0 }));
  const head = el("line", { class: "spark-head", x1: SPARK_W - 0.5, y1: 0, x2: SPARK_W - 0.5, y2: SPARK_H });
  svg.appendChild(head);

  const peakEl = document.getElementById("spark-peak");

  // Map a frame index to its center-x within the current window (or null if the
  // frame is not currently in view) — used by the spike() one-shot highlight.
  let curStart = 0;
  const barRects = new Map(); // frame index -> fresh rect currently drawn

  function paint(head_i) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    barRects.clear();
    const headIdx = head_i < 0 ? -1 : Math.min(head_i, n - 1);
    // window ends at the head; before frame 0 we show the first `win` frames.
    const start = headIdx < 0 ? 0 : Math.max(0, headIdx - (win - 1));
    curStart = start;

    // peak within the visible window (fresh only), floored.
    let winPeak = FRESH_SCALE_FLOOR;
    for (let k = 0; k < win; k++) {
      const i = start + k;
      if (i >= 0 && i < n) winPeak = Math.max(winPeak, frames[i].cost.fresh, frames[i].cost.reused);
    }
    const hY = (v) => y0 - (v / winPeak) * usableH;

    let dPath = "";
    let drewLine = false;
    for (let k = 0; k < win; k++) {
      const i = start + k;
      const cx = k * barW + (barW - innerW) / 2;
      if (i < 0 || i >= n) continue;
      const f = frames[i];
      if (f.cost.reused > 0) {
        const h = y0 - hY(f.cost.reused);
        layer.appendChild(el("rect", {
          class: "spark-bar reused", x: cx, y: hY(f.cost.reused),
          width: innerW, height: Math.max(0.6, h),
        }));
      }
      if (f.cost.fresh > 0) {
        const h = y0 - hY(f.cost.fresh);
        const isSpike = f.cost.fresh >= winPeak * 0.6 && f.cost.fresh >= FRESH_SCALE_FLOOR * 1.5;
        const r = el("rect", {
          class: `spark-bar c-${f.cost.surpriseCause}` + (isSpike ? " spike-bar" : ""),
          x: cx, y: hY(f.cost.fresh), width: innerW, height: Math.max(1, h),
          "data-index": String(i),
        });
        if (i > headIdx) r.classList.add("future");
        layer.appendChild(r);
        barRects.set(i, { r, x: cx + innerW / 2 });
      }
      const x = k * barW + barW / 2;
      const y = hY(f.cost.fresh);
      dPath += (drewLine ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
      drewLine = true;
    }
    if (dPath) layer.appendChild(el("path", { class: "spark-line-fresh", d: dPath.trim() }));

    // playhead at the head's column (last in window unless near the very start)
    const headK = headIdx < 0 ? -1 : headIdx - start;
    const hx = headIdx < 0 ? SPARK_W - 0.5 : headK * barW + barW / 2;
    head.setAttribute("x1", String(hx));
    head.setAttribute("x2", String(hx));
    head.style.opacity = headIdx < 0 ? "0.3" : "0.9";

    // caption: the peak IN VIEW (windowed), so it reads the local story not the
    // global cold-boot maximum.
    if (peakEl) {
      let inView = 0;
      for (let k = 0; k < win; k++) {
        const i = start + k;
        if (i >= 0 && i <= headIdx && i < n) inView = Math.max(inView, frames[i].cost.fresh);
      }
      peakEl.textContent = inView > 0 ? `window peak ${fmt(inView)}` : "flat · 0 fresh";
    }
  }

  paint(-1);

  return {
    barW,
    setHead(index) { paint(index); },
    // fire a one-shot spike highlight on the bar that just rendered (if in view).
    spike(index) {
      const b = barRects.get(index);
      if (!b || !b.r) return;
      const r = b.r;
      r.style.transformOrigin = `${b.x}px ${SPARK_H}px`;
      r.animate(
        [
          { filter: "drop-shadow(0 0 8px var(--fresh))", opacity: 1, transform: "scaleY(1.1)" },
          { filter: "none", opacity: 1, transform: "scaleY(1)" },
        ],
        { duration: 650, easing: "ease-out" },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// The app: snapshot + scrub index → coordinated render of graph/timeline/meter.
// ---------------------------------------------------------------------------

const Geom = { nodeW: 158, nodeH: 64, colGap: 40, rowGap: 44, padX: 40, padY: 44 };

// Read recording-driver params from the query string AND the hash (so they
// survive a `location.hash='frame=N'` deep-link, which the recorder uses):
//   ?autoplay=1 (or #autoplay) — auto-start the cascade on load
//   ?speed=2    (or #speed=2)  — initial playback speed multiplier
//   #frame=N                   — park on a receipt (existing deep-link)
// These make the recording deterministic: the script just opens a URL.
function readParams() {
  const out = {};
  const qs = new URLSearchParams(window.location.search || "");
  const hashStr = (window.location.hash || "").replace(/^#/, "");
  const hp = new URLSearchParams(hashStr.replace(/&/g, "&"));
  const get = (k) => (qs.has(k) ? qs.get(k) : hp.has(k) ? hp.get(k) : null);
  const ap = get("autoplay");
  out.autoplay = ap !== null && ap !== "0" && ap !== "false";
  // bare `#autoplay` (no value) also counts
  if (!out.autoplay && /(?:^|[#&?])autoplay(?:$|[&])/.test(window.location.href)) {
    out.autoplay = true;
  }
  const sp = Number(get("speed"));
  out.speed = Number.isFinite(sp) && sp > 0 ? sp : null;
  return out;
}

function createApp(snapshot) {
  const svg = document.getElementById("graph");
  const sparkSvg = document.getElementById("spark");
  const listEl = document.getElementById("receiptlist");
  const meterEl = document.getElementById("meterbody");

  const layout = buildLayout(snapshot, Geom);
  const { edgeByKey, nodeById } = renderGraph(svg, layout);
  const edgeLayer = svg.querySelector(".edges");
  const listItems = renderTimeline(listEl, snapshot.frames);
  const spark = buildSpark(sparkSvg, snapshot.frames);
  document.getElementById("timeline-count").textContent =
    `· ${snapshot.frames.length}`;

  const grandTotal = snapshot.costRollup.total;

  // A "fresh spike" = a frame whose fresh cost dwarfs the typical non-zero
  // tick (the expensive node finally waking, beat 8). Threshold off the median
  // non-zero fresh so the meter glow fires ONLY on the real spike, not routine
  // renders. The meter pulses + the big number scales when one lands.
  const meterPanel = document.getElementById("meter");
  const freshNonZero = snapshot.frames
    .map((f) => f.cost.fresh)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const medianFresh = freshNonZero.length
    ? freshNonZero[Math.floor(freshNonZero.length / 2)]
    : 0;
  const spikeThreshold = Math.max(medianFresh * 4, 2000);
  function isFreshSpike(i) {
    const f = snapshot.frames[i];
    return !!f && f.status === "rendered" && f.cost.fresh >= spikeThreshold;
  }
  function pulseMeter() {
    if (!meterPanel) return;
    meterPanel.classList.remove("spike");
    void meterPanel.offsetWidth;
    meterPanel.classList.add("spike");
    setTimeout(() => meterPanel.classList.remove("spike"), 1100);
  }

  // ---- THE LIT PATH (review #1/#2, the keystone). A parked keyframe must show
  // the FULL active propagation path lit at once — Claude Adapter → Session
  // Ledger → Session Summary[claudeA] → Workstream Index → Dashboard — with the
  // sibling adapter lanes (and their edges) genuinely DARK. The per-frame edge
  // pulses are transient (good for video, useless for a still), so we precompute,
  // for EVERY frame index, the contiguous propagation "drain" ending at that frame
  // and hold its edges + nodes lit as steady state.
  //
  // A drain is one cascade: it opens on an EXTERNAL wake (a phantom source / the
  // Runtime Watch gateway firing on a new FS delta) and continues through the
  // `input`-caused rendered receipts it triggers, until the next external wake or
  // a quiet gap (a skip/fail that isn't part of the same propagation). We walk the
  // frames once, grouping each maximal run of rendered receipts that belongs to a
  // single externally-triggered cascade, and union the edges each lit.
  const frames = snapshot.frames;
  // For each frame index: { edges:Set(edgeKey), nodes:Set(nodeId) } describing the
  // lit path of the drain that frame belongs to, accumulated UP TO that frame (so
  // parking mid-cascade lights only what has propagated so far; parking on the
  // last frame of the drain lights the whole chain).
  const DRAIN_EDGES = new Array(frames.length).fill(null);
  const DRAIN_NODES = new Array(frames.length).fill(null);
  {
    let i = 0;
    while (i < frames.length) {
      const f = frames[i];
      // A drain opens when an external wake renders & moves something (the gateway
      // lighting on a real delta). Cold-boot also opens one (its first frame is the
      // phantom source rendering). Quiet skips / self-ticks / fails don't open a
      // propagation path.
      const opensDrain =
        f.status === "rendered" &&
        (f.wakeSource === "external" || (i === 0 && f.edgesToLight.length >= 0));
      if (!opensDrain) { i++; continue; }
      // Collect the contiguous run of rendered frames that forms this cascade:
      // start at i, keep consuming while the next frame is rendered and is NOT a
      // fresh external wake of its own (a new external wake starts a NEW drain).
      const runStart = i;
      let j = i;
      const edgeAcc = []; // ordered: [{upto, key}]
      const nodeAcc = []; // ordered: [{upto, id}]
      const touched = new Set(); // nodes this drain has rendered
      let lastRendered = runStart; // index of the last rendered frame in the run
      while (j < frames.length) {
        const fj = frames[j];
        if (j > runStart && fj.status === "rendered" && fj.wakeSource === "external") break;
        if (fj.status === "rendered") {
          // the producer node itself is lit-path
          touched.add(fj.node);
          nodeAcc.push({ upto: j, id: fj.node });
          for (const e of fj.edgesToLight) {
            edgeAcc.push({ upto: j, key: e.producer + "→" + e.subscriber + "::" + e.facet,
              sub: e.subscriber });
          }
          lastRendered = j;
          j++;
        } else if (fj.status === "skipped" && touched.has(fj.node)) {
          // a memo-skip of a node THIS drain already rendered (a re-check inside the
          // same cascade) doesn't break it; keep scanning. A skip of an UNRELATED
          // node (a separate quiet beat) ends the drain so it isn't swept in.
          j++;
        } else {
          break; // a failure or an unrelated quiet skip ends the drain
        }
      }
      // Trim trailing memo-skips: the drain's lit path ends at its last RENDERED
      // frame (trailing skips light nothing and belong to the following quiet beat).
      const runEnd = lastRendered + 1;
      // Now assign, for each frame index in [runStart, runEnd), the accumulated lit
      // edges/nodes UP TO and INCLUDING that index.
      for (let k = runStart; k < runEnd; k++) {
        const eset = new Set();
        const nset = new Set();
        for (const a of edgeAcc) if (a.upto <= k) { eset.add(a.key); nset.add(a.sub); }
        for (const a of nodeAcc) if (a.upto <= k) nset.add(a.id);
        DRAIN_EDGES[k] = eset;
        DRAIN_NODES[k] = nset;
      }
      // Resume after the last lit frame (trailing memo-skips are re-scanned but
      // won't open a drain, so they fall through as quiet frames).
      i = Math.max(runEnd, runStart + 1);
    }
  }
  // The cold-boot drain is the establishing cascade that opens at frame 0 — the
  // whole graph lights once there, so we KEEP that shot at full brightness (no
  // focus-dim). Its end is the last frame whose lit path still includes the very
  // first edge lit at boot (i.e. the same drain frame 0 opened); once a later
  // frame's path no longer contains that boot edge we've left the cold-boot drain.
  let coldBootEnd = 0;
  {
    const bootEset = DRAIN_EDGES[0];
    // the first edge any cold-boot frame lights (Agent FS → Runtime Watch lane)
    let bootEdge = null;
    for (let k = 0; k < DRAIN_EDGES.length && !bootEdge; k++) {
      if (DRAIN_EDGES[k] && DRAIN_EDGES[k].size) bootEdge = [...DRAIN_EDGES[k]][0];
    }
    for (let k = 0; k < DRAIN_EDGES.length; k++) {
      const e = DRAIN_EDGES[k];
      if (e && bootEdge && e.has(bootEdge)) coldBootEnd = k; else if (coldBootEnd > 0) break;
    }
    void bootEset;
  }

  // ---- Hero caption (data-driven, no hardcoded frame index). For each frame
  // we precompute an optional one-line caption that reads the selectivity on
  // camera. The marquee beat: a producer that fans out to many subscribers but,
  // on THIS delta, woke only a few — the rest "stayed dark". We count the
  // producer's distinct downstream subscribers from the topology and compare to
  // how many this frame actually woke; when most stayed dark we caption it.
  const subsByProducer = new Map(); // producer -> Set(subscriber)
  for (const e of snapshot.edges) {
    let s = subsByProducer.get(e.producer);
    if (!s) subsByProducer.set(e.producer, (s = new Set()));
    s.add(e.subscriber);
  }
  // The base selective-wake caption for a single frame: a producer that fans out
  // to many subscribers but, on THIS delta, woke only a few.
  function selectiveDarkCount(f) {
    if (!f || f.status !== "rendered") return 0;
    const all = subsByProducer.get(f.node);
    if (!all || all.size < 3) return 0;
    const woke = f.wokenSubscribers.length;
    const dark = all.size - woke;
    if (woke === 0 || dark < 2 || woke > all.size / 2) return 0;
    return dark;
  }
  function selectiveCaptionForFrame(f) {
    const dark = selectiveDarkCount(f);
    if (!dark) return null;
    const woke = f.wokenSubscribers.length;
    const wokeLabels = f.wokenSubscribers.map((s) => shortName(s));
    const lit = wokeLabels.length === 1 ? wokeLabels[0] : `${woke} lanes`;
    return `${dark} sibling${dark === 1 ? "" : "s"} stayed dark · only ${lit} lit`;
  }
  // The diamond convergence caption: a frame that woke ≥2 distinct subscribers in
  // one drain — the single-wake reads "converged once".
  function diamondCaptionForFrame(f) {
    if (!f || f.status !== "rendered" || f.wokenSubscribers.length < 2) return null;
    return `${f.wokenSubscribers.length} producers moved · woken exactly once`;
  }
  // Precompute a STICKY caption per frame index (review #2): when a selective
  // gateway wake fires (Runtime Watch lights only the Claude lane), carry that
  // caption forward through the lane's immediate downstream cascade so the still
  // PARKED on "Claude Adapter rendered" still shows "5 siblings stayed dark".
  // The caption is held until the next material gateway event (a new external
  // wake that re-renders the gateway) or a quiet stretch.
  const CAPTIONS = new Array(snapshot.frames.length).fill(null);
  {
    let carry = null;
    let carryLeft = 0;
    let carryDark = 0; // dark-sibling strength of the carried selective caption
    for (let i = 0; i < snapshot.frames.length; i++) {
      const f = snapshot.frames[i];
      // A failed frame or a big fresh-spike frame OWNS its own beat — give it an
      // explicit self-narrating caption (review #3/#4) so the silent autoplay clip
      // reads every hero beat, and clear any carried selective/diamond caption so
      // those beats aren't mislabeled.
      if (f.status === "failed") {
        carry = null;
        carryLeft = 0;
        carryDark = 0;
        CAPTIONS[i] = `${shortName(f.node)} failed · nothing downstream moved`;
        continue;
      }
      if (f.cost.fresh >= 5000) {
        carry = null;
        carryLeft = 0;
        carryDark = 0;
        CAPTIONS[i] = `${shortName(f.node)} finally wakes · ${fmt(f.cost.fresh)} fresh`;
        continue;
      }
      // A self-sourced tick (the audit floor on a quiet world) — lights no edges,
      // costs nothing. Caption it for parity with the other hero beats (review #4).
      if (f.wakeSource === "self") {
        CAPTIONS[i] = "self-tick · no edges lit · ~0 cost";
        carry = null;
        carryLeft = 0;
        carryDark = 0;
        continue;
      }
      // The cold-boot cascade is the establishing "the graph lights up once" shot —
      // every gateway wakes ALL its children there, so a "woken exactly once"
      // diamond caption would mislabel it. Suppress captions during cold boot.
      if (i <= coldBootEnd) { CAPTIONS[i] = null; continue; }
      const sel = selectiveCaptionForFrame(f);
      const selDark = selectiveDarkCount(f);
      const dia = diamondCaptionForFrame(f);
      // Within one drain the STRONGEST selective wake wins (the gateway lighting
      // only 1 of 6 adapters — "5 siblings dark" — is a louder story than a
      // downstream ledger lighting 1 of 3 summaries). So a new selective caption
      // only REPLACES the carried one when it has at least as many dark siblings;
      // otherwise we keep carrying the upstream hero message through the cascade so
      // a still PARKED on the last node of the drain (the Dashboard at the end of
      // the Claude path) still reads "5 sibling lanes stayed dark".
      // A DIAMOND convergence (one producer waking ≥2 subscribers in a single
      // drain — the fan-in single-wake) is the headline of the diamond beat, so it
      // TAKES OVER the carry from its frame onward, overriding an upstream gateway
      // selectivity caption. It holds to the convergence node (Workstream Index)
      // where the recording parks. Outside the diamond drain `dia` simply doesn't
      // fire (cold boot is suppressed; the hero/recover drains wake exactly one).
      if (dia) {
        carry = dia;
        carryDark = 99; // unbeatable, so a downstream selective wake can't steal it
        carryLeft = 5;
      } else if (sel && (carryLeft <= 0 || selDark >= carryDark)) {
        carry = sel;
        carryDark = selDark;
        carryLeft = 7;
      }
      if (carry && carryLeft > 0) {
        CAPTIONS[i] = carry;
        carryLeft--;
      } else {
        carry = null;
        carryDark = 0;
      }
    }
  }
  // ---- Authored beats override (data-driven captions). When the served state
  // carries an authored `beats.json` (`snapshot.beats`), we build a
  // `park-frame → caption` map from its beats and PREFER an authored caption on
  // that beat's park frame over the computed observatory caption above. A
  // state-dir with no `beats.json` (e.g. the agent-observatory) has no
  // `snapshot.beats`, so this map is empty and `captionFor` falls back to the
  // computed `CAPTIONS` exactly as before — the observatory is unchanged.
  const BEAT_CAPTION_BY_FRAME = new Map();
  if (snapshot.beats && Array.isArray(snapshot.beats.beats)) {
    for (const b of snapshot.beats.beats) {
      if (
        b &&
        typeof b.park === "number" &&
        typeof b.caption === "string" &&
        b.caption
      ) {
        BEAT_CAPTION_BY_FRAME.set(b.park, b.caption);
      }
    }
  }
  function captionFor(f) {
    if (!f) return null;
    // Prefer the authored beat caption on a beat's park frame; otherwise fall
    // back to the computed caption (the original observatory behavior).
    if (BEAT_CAPTION_BY_FRAME.has(f.index)) {
      return BEAT_CAPTION_BY_FRAME.get(f.index);
    }
    return CAPTIONS[f.index] ?? null;
  }
  const captionEl = document.getElementById("herocaption");
  function showCaption(text) {
    if (!captionEl) return;
    if (text) {
      captionEl.textContent = text;
      captionEl.hidden = false;
      captionEl.classList.remove("show");
      void captionEl.offsetWidth; // restart transition
      captionEl.classList.add("show");
    } else {
      captionEl.classList.remove("show");
      captionEl.hidden = true;
    }
  }

  // Scrub state. index === -1 means "before the first receipt" (clean topology).
  // `speed` scales BOTH the step cadence AND the pulse duration so fast playback
  // stays legible (shorter, snappier flashes) and slow playback lingers.
  const state = { index: -1, playing: false, speed: 1, timer: null };
  const N = snapshot.frames.length;

  // Pulse duration (ms) tracks speed: ~700ms at 1×, floored so 8× still flashes.
  // During playback it's also capped near the step interval (600/speed) so fast
  // play stays crisp instead of smearing overlapping pulses.
  const STEP_BASE = 600;
  function pulseMs() {
    const base = Math.max(180, Math.round(700 / Math.sqrt(state.speed)));
    if (!state.playing) return base;
    return Math.min(base, Math.round((STEP_BASE / state.speed) * 1.6));
  }

  // ---- Transient animations (S2): fire-and-forget pulses for a single frame.
  // Kept SEPARATE from `applyIndex`'s idempotent state so a backward scrub or a
  // long jump never replays a cascade; only a real step/play tick fires these.
  const FLASH_CLASSES = ["flash", "skip-pulse", "fail-pulse", "woken", "self-pulse",
    "cause-input", "cause-self", "cause-external"];

  function pulseNode(id, kind, cause) {
    const g = nodeById.get(id);
    if (!g) return;
    // restart cleanly if the same node fires twice in quick succession
    g.classList.remove(...FLASH_CLASSES);
    void g.getBBox();
    g.style.setProperty("--pulse", pulseMs() + "ms");
    if (kind === "flash") {
      g.classList.add("flash");
      if (cause) g.classList.add("cause-" + cause);
    } else if (kind === "skip") {
      g.classList.add("skip-pulse");
    } else if (kind === "self") {
      g.classList.add("self-pulse");
    } else if (kind === "fail") {
      g.classList.add("fail-pulse");
    } else if (kind === "woken") {
      g.classList.add("woken");
    }
    const onEnd = () => {
      g.classList.remove(...FLASH_CLASSES);
      g.removeEventListener("animationend", onEnd);
    };
    g.addEventListener("animationend", onEnd);
  }

  function lightEdge(light) {
    const key = light.producer + "→" + light.subscriber + "::" + light.facet;
    const path = edgeByKey.get(key);
    if (!path) return;
    const ms = pulseMs();
    path.style.setProperty("--pulse", ms + "ms");
    path.classList.add("lit");
    path.addEventListener("animationend", function done() {
      path.classList.remove("lit");
      path.style.removeProperty("--pulse");
      path.removeEventListener("animationend", done);
    });
    // a chasing dash + a token bead riding the same geometry, producer→subscriber.
    const atomic = light.facet === "@atomic";
    const flow = atomic ? "var(--rendered)" : "var(--cause-external)";
    const d = path.getAttribute("d");
    const dash = el("path", { class: "flow-dash " + (atomic ? "facet-atomic" : "facet-named"), d });
    dash.style.setProperty("--pulse", ms + "ms");
    edgeLayer.appendChild(dash);
    dash.addEventListener("animationend", () => dash.remove());

    const bead = el("circle", { class: "flow-bead", r: "3.2", cx: "0", cy: "0" });
    bead.style.setProperty("--flow", flow);
    edgeLayer.appendChild(bead);
    const len = path.getTotalLength();
    const t0 = performance.now();
    (function ride(now) {
      const t = Math.min(1, (now - t0) / ms);
      const p = path.getPointAtLength(t * len);
      bead.setAttribute("cx", p.x);
      bead.setAttribute("cy", p.y);
      bead.style.opacity = String(t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1);
      if (t < 1) requestAnimationFrame(ride);
      else bead.remove();
    })(t0);
  }

  function fireFrame(i) {
    const f = snapshot.frames[i];
    if (!f) return;
    const isSelf = f.wakeSource === "self";
    if (f.status === "rendered") {
      // rendered + moved fingerprint = the bright highlight box; rendered but
      // nothing moved (a self-tick that "stops there, costing nothing
      // downstream") = a lone violet self-pulse that lights no edges (plan §4).
      pulseNode(f.node, isSelf ? "self" : f.movedFacets.length ? "flash" : "self", f.wakeSource);
      for (const light of f.edgesToLight) lightEdge(light);
      // diamond single-wake: ring each DISTINCT woken subscriber once, staggered
      // a hair after the producer flash so the propagation reads as a cascade.
      f.wokenSubscribers.forEach((sub, k) => {
        setTimeout(() => pulseNode(sub, "woken"), 60 + Math.min(k, 6) * 18);
      });
    } else if (f.status === "skipped") {
      // A SELF-sourced skip is the audit-floor self-tick (review #8): fire the
      // distinct violet self-pulse on the canvas, not a generic grey skip ripple.
      pulseNode(f.node, isSelf ? "self" : "skip");
    } else if (f.status === "failed") {
      pulseNode(f.node, "fail");
    }
    spark.spike(i);
    if (isFreshSpike(i)) pulseMeter();
  }

  const seek = document.getElementById("seek");
  seek.min = "-1";
  seek.max = String(N - 1);
  seek.value = "-1";

  const readout = document.getElementById("scrubreadout");
  const playBtn = document.getElementById("btn-play");

  let prevHit = null; // node id currently marked as hit
  // The HEAD node's steady-state "lit" classes (review #1/#2/#3): set idempotently
  // on the node the scrub head sits on so a PARKED frame (deep-link / keyframe
  // capture) shows the rendered node at full brightness — the still is shot at the
  // peak, not after the pulse decays. Cleared and re-applied on every applyIndex.
  const HEAD_LIT_CLASSES = ["rendered-now", "recovered-now", "cause-self", "self-now"];
  let prevHeadLit = null;
  let prevWokeOnce = []; // subscriber ids currently holding a "woke-once" ring
  // The steady-state LIT PATH currently held: the edges + nodes of the active
  // drain (review #1/#2). Cleared and re-applied on every applyIndex so a parked
  // keyframe shows exactly the path that has propagated up to the head.
  let prevPathEdges = []; // edge <path> elements holding `.path-lit`
  let prevPathNodes = []; // node <g> elements holding `.path-node`

  // Paint the lit path for a parked frame: bright steady-state edges along the
  // active propagation drain, plus a path-node ring on every node in it. The
  // sibling-adapter lanes that DIDN'T propagate keep the dark base edge — that
  // contrast is the whole pitch.
  function applyLitPath(idx) {
    for (const p of prevPathEdges) p.classList.remove("path-lit");
    for (const g of prevPathNodes) g.classList.remove("path-node");
    prevPathEdges = [];
    prevPathNodes = [];
    if (idx < 0) return;
    const eset = DRAIN_EDGES[idx];
    const nset = DRAIN_NODES[idx];
    if (eset) {
      for (const key of eset) {
        const path = edgeByKey.get(key);
        if (path) { path.classList.add("path-lit"); prevPathEdges.push(path); }
      }
    }
    if (nset) {
      for (const id of nset) {
        const g = nodeById.get(id);
        if (g) { g.classList.add("path-node"); prevPathNodes.push(g); }
      }
    }
  }

  // Is this rendered frame a RECOVERY? (a node whose immediately-prior receipt
  // failed → this render is the green "came back" beat, review #7).
  function isRecovery(i) {
    const f = snapshot.frames[i];
    if (!f || f.status !== "rendered") return false;
    for (let j = i - 1; j >= 0; j--) {
      if (snapshot.frames[j].node === f.node) return snapshot.frames[j].status === "failed";
    }
    return false;
  }

  function applyIndex(i) {
    state.index = clamp(i, -1, N - 1);

    // Graph: clear prior hit, mark the current node by its disposition.
    if (prevHit) {
      const g = nodeById.get(prevHit);
      if (g) g.classList.remove("hit", "skipped", "failed");
      prevHit = null;
    }
    if (prevHeadLit) {
      const g = nodeById.get(prevHeadLit);
      if (g) g.classList.remove(...HEAD_LIT_CLASSES);
      prevHeadLit = null;
    }
    // "untouched" dimming: a node is untouched until a receipt has hit it at
    // or before the head. Recompute the touched set lazily on jumps; cheap for
    // demo-sized graphs.
    markTouched(state.index);

    if (state.index >= 0) {
      const f = snapshot.frames[state.index];
      const g = nodeById.get(f.node);
      if (g) {
        g.classList.add("hit");
        if (f.status === "skipped") g.classList.add("skipped");
        if (f.status === "failed") g.classList.add("failed");
        prevHit = f.node;

        // Steady-state lit treatment for the head node so a parked keyframe pops.
        if (f.status === "rendered") {
          if (isRecovery(state.index)) {
            g.classList.add("recovered-now");
          } else if (f.wakeSource === "self" || f.movedFacets.length === 0) {
            // a self-tick / no-move render reads as the violet audit pulse
            g.classList.add("rendered-now", "cause-self");
          } else {
            g.classList.add("rendered-now");
          }
          prevHeadLit = f.node;
        } else if (f.status === "skipped" && f.wakeSource === "self") {
          // a SELF-sourced skip is the audit-floor self-tick — hold a violet ring
          // on the canvas so the PARKED still reads the self-pulse (review #8),
          // not a generic grey memo-skip.
          g.classList.add("self-now");
          prevHeadLit = f.node;
        }
      }
    }

    // diamond convergence (review #6): when the HEAD frame woke ≥2 distinct
    // subscribers in one drain, hold a "woke-once" ring on each woken subscriber
    // so a PARKED still reads the single-wake (the fan-in converged here, once).
    if (prevWokeOnce.length) {
      for (const id of prevWokeOnce) {
        const g = nodeById.get(id);
        if (g) g.classList.remove("woke-once");
      }
      prevWokeOnce = [];
    }
    if (state.index >= 0) {
      const f = snapshot.frames[state.index];
      if (f.status === "rendered" && f.wokenSubscribers.length >= 2) {
        for (const sub of f.wokenSubscribers) {
          const g = nodeById.get(sub);
          if (g) { g.classList.add("woke-once"); prevWokeOnce.push(sub); }
        }
      }
    }

    // Timeline: current / future shading + autoscroll.
    listItems.forEach((li, idx) => {
      li.classList.toggle("current", idx === state.index);
      li.classList.toggle("future", idx > state.index);
    });
    if (state.index >= 0 && listItems[state.index]) {
      listItems[state.index].scrollIntoView({ block: "nearest" });
    }

    // The lit propagation path (steady state) for a parked still (review #1/#2).
    applyLitPath(state.index);

    renderMeter(meterEl, snapshot.frames, state.index, grandTotal);
    spark.setHead(state.index);
    seek.value = String(state.index);
    updateReadout();
    showCaption(state.index >= 0 ? captionFor(snapshot.frames[state.index]) : null);

    // FOCUS mode (review #5): on the path/hero/diamond beats, dim the right-hand
    // receipts panel so the lit graph path is the brightest thing on screen and
    // pulls the eye. We treat a frame as "focus" when it sits inside a drain whose
    // lit path is non-trivial (≥2 edges) — i.e. the hero & diamond & recover beats
    // — and NOT a big cost-spike frame (that beat's hero is the meter, not the
    // graph). Cold-boot (the whole graph lights) is excluded so the establishing
    // shot stays full-brightness.
    const fr = state.index >= 0 ? snapshot.frames[state.index] : null;
    const eset = state.index >= 0 ? DRAIN_EDGES[state.index] : null;
    const isColdBoot = state.index >= 0 && state.index <= coldBootEnd;
    const focus =
      !!fr && !!eset && eset.size >= 2 && !isColdBoot &&
      !(fr.cost && fr.cost.fresh >= 5000);
    document.body.classList.toggle("focus", focus);
  }

  const touchedCache = new Set();
  const renderedCache = new Set(); // nodes that have RENDERED at/before the head
  let touchedUpto = -1; // nodes start untouched (set in renderGraph); head is before frame 0
  function markTouched(upto) {
    // Incremental when stepping forward; full rebuild on backward jumps.
    if (upto < touchedUpto) {
      touchedCache.clear();
      renderedCache.clear();
      touchedUpto = -1;
      for (const g of nodeById.values()) {
        g.classList.add("untouched");
        g.classList.remove("lit-floor");
      }
    }
    for (let i = Math.max(0, touchedUpto + 1); i <= upto; i++) {
      const fr = snapshot.frames[i];
      const node = fr.node;
      if (!touchedCache.has(node)) {
        touchedCache.add(node);
        const g = nodeById.get(node);
        if (g) g.classList.remove("untouched");
      }
      // A node that has RENDERED keeps the warm "lit floor" so it reads alive in
      // a still (review #1/#3). A node only ever skipped/failed stays cooler.
      if (fr.status === "rendered" && !renderedCache.has(node)) {
        renderedCache.add(node);
        const g = nodeById.get(node);
        if (g) g.classList.add("lit-floor");
      }
    }
    touchedUpto = upto;
  }

  function updateReadout() {
    if (state.index < 0) {
      readout.innerHTML = `<span class="hl">ready</span> · frame —/${N}`;
      return;
    }
    const f = snapshot.frames[state.index];
    const moved = f.movedFacets.length
      ? f.movedFacets.join(", ")
      : "—";
    readout.innerHTML =
      `frame <span class="hl">${state.index}</span>/${N - 1} · ` +
      `<span class="hl">${escapeHtml(shortName(f.node))}</span> · ` +
      `${f.status} · ${f.cost.surpriseCause} · moved [${escapeHtml(moved)}]`;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Transport. A forward step both advances the idempotent state AND fires that
  // frame's transient pulse (the cascade). Backward/jump never fire pulses.
  function stepForward() {
    if (state.index >= N - 1) { pause(); return false; }
    const next = state.index + 1;
    applyIndex(next);
    fireFrame(next);
    return true;
  }
  function stepBack() { applyIndex(state.index - 1); }
  function jumpStart() { applyIndex(-1); }
  function jumpEnd() { applyIndex(N - 1); }

  function play() {
    if (N === 0) return;
    if (state.index >= N - 1) applyIndex(-1); // restart from clean if at the end
    state.playing = true;
    playBtn.textContent = "❚❚";
    playBtn.classList.add("playing");
    schedule();
  }
  function pause() {
    state.playing = false;
    playBtn.textContent = "▶";
    playBtn.classList.remove("playing");
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  }
  function toggle() { state.playing ? pause() : play(); }

  function schedule() {
    if (!state.playing) return;
    state.timer = setTimeout(() => {
      const ok = stepForward();
      if (ok) schedule();
    }, STEP_BASE / state.speed);
  }

  // Wire controls.
  document.getElementById("btn-play").onclick = toggle;
  document.getElementById("btn-step").onclick = () => { pause(); stepForward(); };
  document.getElementById("btn-step-back").onclick = () => { pause(); stepBack(); };
  document.getElementById("btn-start").onclick = () => { pause(); jumpStart(); };
  document.getElementById("btn-end").onclick = () => { pause(); jumpEnd(); };
  document.getElementById("speed").onchange = (e) => {
    state.speed = Number(e.target.value) || 1;
    if (state.playing) { clearTimeout(state.timer); schedule(); }
  };
  seek.oninput = (e) => { pause(); applyIndex(Number(e.target.value)); };

  listEl.addEventListener("click", (e) => {
    const li = e.target.closest(".ritem");
    if (!li) return;
    pause();
    applyIndex(Number(li.dataset.index));
  });

  // Keyboard: space play/pause, ←/→ step, Home/End jump.
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); pause(); stepForward(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); pause(); stepBack(); }
    else if (e.key === "Home") { e.preventDefault(); pause(); jumpStart(); }
    else if (e.key === "End") { e.preventDefault(); pause(); jumpEnd(); }
  });

  // Recording-driver params + deep-link. `?speed=` sets the initial speed (and
  // the <select> to match); `#frame=12` parks on a receipt; `?autoplay=1`
  // auto-starts the cascade on load (deterministic recording with no clicks).
  const params = readParams();
  if (params.speed) {
    state.speed = params.speed;
    const sel = document.getElementById("speed");
    if (sel) {
      // reflect the requested speed if it's an offered option
      const has = Array.from(sel.options).some((o) => Number(o.value) === params.speed);
      if (has) sel.value = String(params.speed);
    }
  }

  const hashFrame = readHashFrame();
  applyIndex(hashFrame !== null ? hashFrame : -1);
  window.addEventListener("hashchange", () => {
    const f = readHashFrame();
    if (f !== null) { pause(); applyIndex(f); }
  });

  function readHashFrame() {
    const m = /(?:^|[#&])frame=(-?\d+)/.exec(window.location.hash || "");
    return m ? Number(m[1]) : null;
  }

  if (params.autoplay && hashFrame === null) {
    // start from clean on the next tick so the first cascade frame fires cleanly
    setTimeout(() => play(), 60);
  }

  return { applyIndex, play, pause };
}

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------

(async function main() {
  const status = document.getElementById("status");
  try {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error("state " + res.status);
    const snap = await res.json();
    window.__REACTOR_SNAPSHOT__ = snap;
    setLabels(snap.labels || {});

    document.getElementById("legend").hidden = false;
    status.textContent =
      `${snap.frames.length} receipts · ${snap.nodes.length} nodes · ` +
      `${snap.edges.length} edges` +
      (snap.hasTopology ? "" : " · no saved topology (node-only fallback)");
    document.getElementById("graphhint").textContent =
      "press ▶ to watch the cascade · space play/pause · ←/→ step · click a receipt to jump";

    createApp(snap);
  } catch (err) {
    status.textContent = "error: " + (err && err.message ? err.message : err);
  }
})();
