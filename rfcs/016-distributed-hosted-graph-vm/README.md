# RFC 016: Distributed Hosted Graph VM

Status: Active implementation

## North Star

OpenProse is the graph VM for agent outcomes. The OSS runtime must be able to run the same reactive graph locally, inside a single workspace capsule, or inside a hosted control plane that delegates atomic node runs to remote workers.

The ideal hosted shape is:

- the control plane runs the OpenProse graph VM
- the graph VM plans, orders, gates, resumes, and materializes runs
- remote workers execute one node envelope at a time
- each node result returns through the OpenProse node execution protocol
- the durable platform stores graph state, node runs, artifacts, approvals, traces, cost, and provenance

This keeps the OSS package as the real meta-harness while letting hosted deployments scale node execution across Sprites or future workers.

## Core Decisions

1. **Graph VM placement is separate from node execution placement.**
   - `graph_vm` remains the semantic runtime, currently `pi`.
   - `execution_placement` distinguishes `local`, `workspace_capsule`, and `distributed`.

2. **A single node run is atomic.**
   - A node run does not cross workers.
   - A graph run may cross workers because the graph VM delegates multiple node runs.

3. **The node execution request/result protocol is the portable worker boundary.**
   - Workers receive a complete `NodeExecutionRequest`.
   - Workers return a complete `NodeExecutionResult`.
   - The graph VM does not depend on Sprites, Fly, Postgres, or platform-specific state.

4. **Hosted control planes must run OSS OpenProse as the graph VM.**
   - Library embedding is the preferred in-process shape when the host can safely
     load the pinned OSS package version.
   - CLI invocation is also a first-class control-plane boundary when the host
     wants version isolation, process isolation, stdout/stderr capture,
     cancellation, or exact commit pinning.
   - Both shapes must invoke the same OSS graph VM and node execution protocol;
     neither should become a second hosted runtime model.

5. **Single-workspace graph execution remains useful but is not the end state.**
   - Local developer runs and smoke tests may still execute the whole graph in one process/workspace.
   - Hosted enterprise runtime targets distributed graph execution.

## Test Backpressure

The implementation is only on track if these tests pass:

1. **Protocol tests**
   - serialize and deserialize `NodeExecutionRequest`
   - execute a single node request with the Pi graph VM
   - reject mismatched graph VM/runtime profile combinations

2. **Control-plane graph VM tests**
   - run a multi-node graph with a delegated node executor
   - prove the local fallback node runner is not called
   - assert dependency order and upstream artifact propagation
   - assert per-node workspaces and request JSON files are written

3. **External-process executor tests**
   - run the graph VM with `--node-executor-command`
   - prove each node request is passed through request/result files
   - surface executor failures as failed/blocked run materialization

4. **Hosted platform tests**
   - control-plane provider invokes OSS graph VM with distributed placement
   - provider records graph-level attempt state in Postgres
   - provider dispatches node envelopes to the worker provider boundary
   - node-level artifacts and events are persisted with worker identity

## Current Implementation State

The OSS package already implements the core distributed graph-VM boundary:

- `runtime_profile.execution_placement`
- `NodeExecutionRequest` and `NodeExecutionResult`
- `DelegatedGraphRuntime`
- `ExternalProcessNodeDelegate`
- `prose remote execute-node <request.json>`
- `prose remote execute --node-executor-command <cmd>`

That is enough for a hosted control plane to run the OpenProse graph VM and
delegate atomic node runs to worker capsules. Platform integration should keep
using this contract directly rather than recreating graph semantics in the
platform.

## Phases

### Phase 01: OSS Placement Vocabulary And Protocol

Add `execution_placement` to runtime profiles and expose helpers for executing a serialized node request.

Tests:

- runtime profile defaults to local placement
- distributed placement is valid
- model providers remain separate from graph VMs
- node request execution produces a `NodeExecutionResult`


### Phase 02: OSS Delegated Graph Runtime

Add a graph runtime that delegates node execution through a `NodeExecutionDelegate`.

Tests:

- multi-node graph succeeds through the delegate
- delegate receives nodes in dependency order
- upstream artifacts are present in downstream node requests
- fallback node runner is never called


### Phase 03: OSS External Node Executor CLI

Add a CLI path for hosted control planes that want to run the graph VM as a process while delegating nodes through a command.

Tests:

- `prose remote execute-node <request.json>` executes one node
- `prose remote execute --node-executor-command <cmd>` executes a graph through request/result files
- command failure produces an actionable diagnostic


### Phase 04: Platform Distributed Provider Contract

Add a platform runtime provider that runs the OSS graph VM in the control plane and delegates node envelopes to a worker provider boundary.

Tests:

- unit test provider command construction
- unit test node dispatch envelope rewriting
- unit test node result parsing and event projection
- integration test with a fake worker provider


### Phase 05: Sprites Worker Implementation

Implement the first real worker provider using Sprites.

Tests:

- worker clones/prepares node workspace
- worker runs `prose remote execute-node`
- result JSON is parsed even when logs are noisy
- failed worker execution is materialized as node failure


### Phase 06: Evidence And Cutover

Run the example ladder locally and through the hosted distributed provider.

Tests:

- OSS `bun test`
- OSS `bun run typecheck`
- platform targeted unit tests
- platform typecheck
- local distributed smoke
- Sprites distributed smoke when credentials are configured
