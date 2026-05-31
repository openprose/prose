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

function shortName(id) {
  // `responsibility.viewport-masker` → `viewport-masker`; keep the kind dim.
  const dot = id.indexOf(".");
  return dot >= 0 ? id.slice(dot + 1) : id;
}
function kindOf(id) {
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
    // Clamp long labels to the box width: monospace ≈ 0.62em/char at 18px.
    const usable = n.w - 30;
    const est = name.length * 18 * 0.62;
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

function renderMeter(meterEl, frames, upto, grandTotal) {
  const { causes, total } = cumulativeCost(frames, upto);
  const sum = total.fresh + total.reused;
  const freshPct = sum > 0 ? (total.fresh / sum) * 100 : 0;
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

  meterEl.innerHTML =
    `<div class="meter-total"><span class="big">${fmt(total.fresh)}</span>` +
    `<span class="unit">fresh tokens so far</span></div>` +
    `<div class="meter-bar">` +
    `<span class="seg-fresh" style="width:${freshPct}%"></span>` +
    `<span class="seg-reused" style="width:${reusedPct}%"></span></div>` +
    `<div class="meter-rows">` +
    `<div class="meter-row"><span class="swatch fresh"></span><span class="k">fresh</span><span class="v">${fmt(total.fresh)}</span></div>` +
    `<div class="meter-row"><span class="swatch reused"></span><span class="k">reused</span><span class="v">${fmt(total.reused)}</span></div>` +
    `</div>` +
    (causeRows ? `<div class="meter-causes">${causeRows}</div>` : "") +
    `<div class="meter-causes"><div class="meter-cause"><span class="cause-name dim">replay total · ${savedPct}% reused</span><span class="dim">${fmt(grandTotal.fresh)} / ${fmt(grandTotal.reused)}</span><span></span></div></div>`;
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

function buildSpark(svg, frames) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${SPARK_W} ${SPARK_H}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const n = frames.length;
  const peakFresh = frames.reduce((m, f) => Math.max(m, f.cost.fresh), 0);
  const peakReused = frames.reduce((m, f) => Math.max(m, f.cost.reused), 0);
  // Headroom so the tallest spike doesn't touch the ceiling; log-ish floor so a
  // quiet "1-token" stretch still reads as ~flat near the baseline, not noise.
  const scaleMax = Math.max(peakFresh, peakReused, 1);
  const padBottom = 4;
  const usableH = SPARK_H - padBottom - 4;
  const barW = n > 0 ? SPARK_W / n : SPARK_W;
  const innerW = Math.max(1, Math.min(barW - 1, barW * 0.7));
  const y0 = SPARK_H - padBottom;

  function hY(v) { return y0 - (v / scaleMax) * usableH; }

  // baseline
  svg.appendChild(el("line", { class: "spark-baseline", x1: 0, y1: y0, x2: SPARK_W, y2: y0 }));

  // reused underlay (faint) then fresh bars (cause-colored), per receipt.
  const bars = []; // index -> { fresh: rect|null }
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    const cx = i * barW + (barW - innerW) / 2;
    let freshRect = null;
    if (f.cost.reused > 0) {
      const h = y0 - hY(f.cost.reused);
      svg.appendChild(el("rect", {
        class: "spark-bar reused", x: cx, y: hY(f.cost.reused),
        width: innerW, height: Math.max(0.6, h),
      }));
    }
    if (f.cost.fresh > 0) {
      const h = y0 - hY(f.cost.fresh);
      freshRect = el("rect", {
        class: `spark-bar c-${f.cost.surpriseCause}`,
        x: cx, y: hY(f.cost.fresh), width: innerW, height: Math.max(0.8, h),
        "data-index": String(i),
      });
      svg.appendChild(freshRect);
    }
    bars.push({ fresh: freshRect, x: cx + innerW / 2 });
  }

  // a thin fresh outline so even all-quiet stretches show the silhouette
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = i * barW + barW / 2;
    const y = hY(frames[i].cost.fresh);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
  }
  if (d) svg.appendChild(el("path", { class: "spark-line-fresh", d: d.trim() }));

  // moving playhead
  const head = el("line", { class: "spark-head", x1: 0, y1: 0, x2: 0, y2: SPARK_H });
  svg.appendChild(head);

  const peakEl = document.getElementById("spark-peak");
  if (peakEl) peakEl.textContent = peakFresh > 0 ? `peak ${fmt(peakFresh)}` : "";

  return {
    barW,
    setHead(index) {
      const x = index < 0 ? 0 : (index + 0.5) * barW;
      head.setAttribute("x1", String(x));
      head.setAttribute("x2", String(x));
      head.style.opacity = index < 0 ? "0" : "0.85";
      // dim future bars
      for (let i = 0; i < bars.length; i++) {
        const r = bars[i].fresh;
        if (r) r.classList.toggle("future", i > index);
      }
    },
    // fire a one-shot spike highlight on the bar that just rendered.
    spike(index) {
      const b = bars[index];
      if (!b || !b.fresh) return;
      const r = b.fresh;
      r.classList.remove("spike-on");
      // force reflow so re-adding restarts the animation
      void r.getBBox();
      r.style.transformOrigin = `${b.x}px ${SPARK_H}px`;
      r.animate(
        [
          { filter: "drop-shadow(0 0 6px var(--fresh))", opacity: 1, transform: "scaleY(1.06)" },
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
  const FLASH_CLASSES = ["flash", "skip-pulse", "fail-pulse", "woken",
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
    if (f.status === "rendered") {
      // rendered + moved fingerprint = the bright highlight box; rendered but
      // nothing moved (a self-tick that "stops there, costing nothing
      // downstream") = a lone dim self-pulse that lights no edges (plan §4).
      pulseNode(f.node, f.movedFacets.length ? "flash" : "skip", f.wakeSource);
      for (const light of f.edgesToLight) lightEdge(light);
      // diamond single-wake: ring each DISTINCT woken subscriber once, staggered
      // a hair after the producer flash so the propagation reads as a cascade.
      f.wokenSubscribers.forEach((sub, k) => {
        setTimeout(() => pulseNode(sub, "woken"), 60 + Math.min(k, 6) * 18);
      });
    } else if (f.status === "skipped") {
      pulseNode(f.node, "skip");
    } else if (f.status === "failed") {
      pulseNode(f.node, "fail");
    }
    spark.spike(i);
  }

  const seek = document.getElementById("seek");
  seek.min = "-1";
  seek.max = String(N - 1);
  seek.value = "-1";

  const readout = document.getElementById("scrubreadout");
  const playBtn = document.getElementById("btn-play");

  let prevHit = null; // node id currently marked as hit

  function applyIndex(i) {
    state.index = clamp(i, -1, N - 1);

    // Graph: clear prior hit, mark the current node by its disposition.
    if (prevHit) {
      const g = nodeById.get(prevHit);
      if (g) g.classList.remove("hit", "skipped", "failed");
      prevHit = null;
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

    renderMeter(meterEl, snapshot.frames, state.index, grandTotal);
    spark.setHead(state.index);
    seek.value = String(state.index);
    updateReadout();
  }

  const touchedCache = new Set();
  let touchedUpto = -1; // nodes start untouched (set in renderGraph); head is before frame 0
  function markTouched(upto) {
    // Incremental when stepping forward; full rebuild on backward jumps.
    if (upto < touchedUpto) {
      touchedCache.clear();
      touchedUpto = -1;
      for (const g of nodeById.values()) g.classList.add("untouched");
    }
    for (let i = Math.max(0, touchedUpto + 1); i <= upto; i++) {
      const node = snapshot.frames[i].node;
      if (!touchedCache.has(node)) {
        touchedCache.add(node);
        const g = nodeById.get(node);
        if (g) g.classList.remove("untouched");
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

  // Optional deep-link: `#frame=12` opens the viewer parked on that receipt
  // (handy for screenshots / sharing a specific moment in the replay).
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
