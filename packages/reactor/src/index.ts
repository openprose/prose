// @openprose/reactor — the public barrel.
//
// Integration-wave wiring (delta.md §A1b, §A5). The judge → verdict →
// policy-drift → recompile → rollback spine is demolished (world-model.md §3
// "do not reintroduce it"): the `./policy`, `./judge`, and `./kernel` (whole
// dir, keep-half extracted to `./cycle`) barrels are gone, along with
// `sdk/exit-bundle.ts`. The barrel now surfaces the ideal run-phase substrate:
// the world-model store, the dumb reconciler, the receipt ledger, the memo
// re-key, Forme + the canonicalizer/postcondition compilers, composition,
// forecast, evidence-plan, cost/projection, the shared shapes, and the SDK
// front door.
//
// Collision policy: several modules legitimately re-export the same shared
// shape helpers (`ATOMIC_FACET`, `EMPTY_SEMANTIC_DIFF`, `createNullSignature`,
// `makeMemoKey`, the identity types) so each compiles standalone. We make
// `./shapes` the canonical home for those names and `./receipt` the canonical
// home for the receipt builders; the other `export *`s contribute their unique
// surface, and TypeScript drops the duplicated names from the star (no
// ambiguity at the barrel).

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

// --- Collision resolution ---------------------------------------------------
// `createSkippedReceipt` legitimately ships from two modules so each compiles
// standalone. We pin the canonical public binding here (the other remains
// reachable on its own subpath export): the canonical builder is the receipt
// ledger's (SHAPES.md §4 — the skipped receipt is a Receipt; delta.md §A3.2);
// the memo module's `SkippedReceiptInput`-shaped helper stays on
// `@openprose/reactor/memo`.
//
// `resolveFacetFingerprint` is NOT a collision: there is ONE declaration, in
// `./shapes` (the read-half of a FingerprintMap), and `./world-model` +
// `./composition` merely re-export that same binding — `export *` of an
// identical re-export is unambiguous, so the barrel surfaces it cleanly with no
// pin needed (world-model.md §5; SHAPES.md §1).
export { createSkippedReceipt } from "./receipt";
