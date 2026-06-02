// @openprose/reactor — the public barrel.

// --- The shared shapes: the coordination spine (SHAPES.md) ------------------
export * from "./shapes";

// --- Cycle + predicate keep-home (SHAPES.md §8) -----------------------------
export * from "./cycle";

// --- The world-model store (architecture.md §5.2, §10; world-model.md §1) ---
export * from "./world-model";

// --- The compiled canonicalizer (architecture.md §3.2) ----------------------
export * from "./canonicalizer";

// --- The compiled postcondition validators (architecture.md §3.3) -----------
export * from "./postcondition";

// --- Forme: the compile-phase wiring (architecture.md §3.1, §6.3) -----------
export * from "./forme";

// --- The receipt ledger object (SHAPES.md §4; delta.md §A3.2) ---------------
export * from "./receipt";

// --- The memo re-key + skip decision (SHAPES.md §3; delta.md §A3.3) ---------
export * from "./memo";

// --- Composition: subscriptions = props, pins = read isolation (§7) ---------
export * from "./composition";

// --- Forecast: continuity clock + self-recheck (architecture.md §3.5) -------
export * from "./forecast";

// --- Evidence resolution by reference (delta.md §A3.1) ----------------------
export * from "./evidence-plan";

// --- Observable surprise-cost + receipt projection (delta.md §A4) -----------
export * from "./cost";
export * from "./projection";

// --- The run-phase reconciler spine (architecture.md §4.1) ------------------
export * from "./reactor";

// --- The injection boundary: adapter port contracts (architecture.md §5.3) --
export * from "./adapters";

// --- The SDK front door: renderAtom + mountDag (architecture.md §1) ---------
export * from "./sdk";

// `createSkippedReceipt` ships from both ./receipt and ./memo; pin ./receipt's
// (the canonical Receipt builder) over the ./memo star-export.
export { createSkippedReceipt } from "./receipt";
