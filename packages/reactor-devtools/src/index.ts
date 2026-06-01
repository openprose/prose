// `@openprose/reactor-devtools` — the public library surface.
//
// The renderer + local server for the Reactor harness: it reads the SDK's
// append-only receipt ledger and animates the DAG the way React DevTools animates
// a component tree (flashes on render, dim pulses on memo-skip, red on fail,
// per-facet edge lights, a fresh-vs-reused token/$ meter). Replay-first.
//
// Importable directly (so the SURPRISE-COST benchmark front-end / a docs site can
// embed it) without pulling the CLI. The standalone `reactor-devtools` bin is the
// out-of-process entry point.

export {
  openStateDir,
  buildSnapshot,
  describeStateDir,
  readTopology,
  unwrapTopology,
  openWorldModels,
  readNodeWorldModel,
  versionForFrame,
  verifyNodeChainRaw,
  verifyReceipt,
  verifyReceiptChain,
  type OpenStateDirOptions,
  type OpenedStateDir,
  type DescribeOptions,
  type DescribeResult,
  type ReplaySnapshot,
  type ReceiptFrame,
  type EdgeLight,
  type NodeView,
  type EdgeView,
  type CostRollupView,
  type NodeWorldModelView,
  type WorldModelFileView,
} from "./data";

export {
  startDevToolsServer,
  type DevToolsServer,
  type DevToolsServerOptions,
} from "./server";
