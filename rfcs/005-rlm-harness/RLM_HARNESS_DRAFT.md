# RLM Harness Proposal (Draft)

## Overview

This document is a companion to the **Recursive Language Model: Context Architecture** paper. Where that document describes the HUD construction—the fractal context structure, the spread operator delegation pattern, the interpreter/program split, the in-HUD registry—this document specifies **how to build the harness itself**: the runtime that makes RLM delegation real.

The core idea: **a skill that transforms any existing linear ReAct harness into a recursive language model.** The skill is the interpreter; programs are separate artifacts injected at invocation time.

### Packaging Gradient

The packaging approach advances in stages; we start at the smallest unit of useful work and expand only when the simpler form proves insufficient.

1. **v1 — Skill only.** The interpreter ships as a single skill. Delegation happens via a subprocess invocation (`pi -p --append-system-prompt <child-hud>`). No separate server, no plugin system, no SDK coupling. This is what we are building first.
2. **v2 — SDK-integrated skill (pi).** The skill gains intra-process delegation via the pi SDK. Children become `AgentSession`s rather than subprocesses: no cold-start cost, structured event streams, `runtime.fork()` for forking history, HUD as a live JS object.
3. **v3 — Multi-harness server with plugins.** A Bun-based outer orchestrator loads per-harness plugins (pi via SDK, Claude Code via subprocess + `--append-system-prompt`, opencode, AMP). Cross-harness spawning becomes possible; cost and capability routing become first-class.

Later sections of this document describe v2/v3; the plugin architecture remains the longer-term vision. But the v1 path is the load-bearing one for the POC and is what the initial skill implements.

---

## The Problem

Today's agent harnesses—Claude Code, opencode, pi, AMP, Codec CLI—are all **linear ReAct loops**: reason, act, reason, act, accumulating context as they go. They have no native concept of recursive delegation, scoped HUD passing, or delta-based returns.

We don't want to rewrite these harnesses. We want to **augment them** with a portable skill that turns them into RLM-capable agents.

---

## The RLM Skill (v1)

### What It Is

The v1 RLM harness is a **skill**—a portable, installable unit distributed as a directory of Markdown files. It contains the interpreter (how to read a HUD, when to delegate, how to return deltas) and nothing else. Programs are separate artifacts that the caller hands to the interpreter at invocation time.

The skill is program-agnostic. It says nothing about directories, summaries, schedules, or any particular task. Anything task-specific lives in the program.

### What the Skill Contains

- **Interpreter instructions** — how to read the HUD's sections (responsibility, return contract, environment, registry), how to decide when to delegate, how to compose returns from children.
- **Delegation primitive** — the exact shell invocation for spawning a child: `pi -p --no-skills --append-system-prompt <child-hud-file> "<task>" < /dev/null`.
- **Return primitive** — the delta format the node emits when it's done, and how to parse a delta coming back from a child.
- **Role inference** — the same file is loaded at every layer; the node infers its role from whether it was handed a parent HUD and registry.

### What the Skill Does NOT Contain

- No specific programs. Programs live as separate files and are composed into HUDs at invocation time.
- No orchestration code. Fan-out and composition are expressed by the *program* in bash/code using the delegation primitive.
- No plugin architecture in v1. Only pi is supported as the delegation target.
- No server. The interpreter runs in-session; children run in subprocesses.

### The v1 Call Shape

Because v1 is skill-only and delegation is a subprocess call, the "call interface" is the shell invocation itself. The parent composes a child HUD file (interpreter pointer + child program body + narrowed registry + curated environment) and runs:

```bash
pi -p --no-skills \
  --skill ~/.claude/skills/rlmify \
  --append-system-prompt <child-hud-file> \
  "<task-string>" \
  < /dev/null
```

The child emits a delta in a parseable form (fenced block) on stdout. The parent extracts and composes it back into its own HUD.

---

## The RLM Server (v2/v3 — future)

The skill-only approach is sufficient for the POC and for many real use cases, but several pain points push toward a richer runtime over time: cold-start cost per subprocess spawn, fragility of stdout parsing, lack of streaming deltas, expensive re-serialization when forking history, and no path to cross-harness delegation.

### v2: SDK-Integrated Skill

For pi specifically, the skill can upgrade to use the pi SDK (`@mariozechner/pi-coding-agent`) intra-process:

- `runtime.fork()` maps directly onto "fork parent history."
- Event subscription replaces stdout parsing.
- The HUD becomes a live JavaScript object, eliminating the serialization boundary.
- Shared `AuthStorage` and `ModelRegistry` across the recursion tree.
- `SessionManager.inMemory()` gives ephemeral children without disk overhead.

### v3: Multi-Harness Server

A Bun-based orchestrator loads plugins per harness. The outer agent calls:

```javascript
rlm.spawn({
  harness: "claude-code",    // which harness plugin to use
  model: "claude-sonnet-4",  // optional: which model (subject to plugin constraints)
  program: "explore_directory", // reference into the registry
  args: { path: "./subdir" },
  scopedRegistry: { ... },   // registry slice the child inherits
  environment: { ... }       // curated slice
})
```

The return is a structured delta with provenance:

```javascript
{
  delta: { ... },
  provenance: {
    layer: 2,
    model: "claude-sonnet-4",
    harness: "claude-code",
    ensures_satisfied: ["..."],
    requires_consumed: ["..."]
  },
  status: "complete" | "partial" | "error"
}
```

---

## Programs and the Registry

### Programs Are First-Class Values

The interpreter is program-agnostic. Programs are separate artifacts—Markdown files with a public face (name, `requires`, `ensures`, when-to-use description) and a body (the instructions and environment injected as a child HUD when delegated to). A caller sees only the public face; a callee runs only its own body.

### The Registry Lives in the HUD

The HUD includes a **registry** section listing currently-known callable programs by their public faces. The registry:

- **Inherits via spread.** A child's initial registry is a (typically narrowed) slice of its parent's.
- **Is augmented during exploration.** When a node discovers a new capability—reading a file that contains a program, detecting a tool in the environment, being told by a parent about a new callee—it can register it.
- **Flows back via deltas.** A child's delta can include registry additions the parent may want to adopt.
- **Never becomes global.** There is no shared mutable singleton; each node has its own scoped instance. See RLM_CONTEXT.md "Programs as First-Class Values."

### Late-Bound Resolution

Callers don't name specific callees—they describe a need by contract. The runtime resolves that need against the registry at delegation time, not at startup. This is the load-bearing departure from Spring-style pre-wiring and from OpenProse's Forme phase (see RLM_CONTEXT.md "Relationship to OpenProse"). The registry is consulted when delegation happens, not before.

In v1 this resolution is done by the program itself (as bash/code that looks up a program by name and composes the child HUD). In v2/v3 the runtime takes over, accepting a program reference plus args and handling body lookup internally.

### Composability: `Scheduled<P>` and Beyond

Because programs are values, they compose. A program can take another program as an argument. `Scheduled<P>` is a program whose responsibility is "hold P, wait until time T, invoke P in a fresh session." It never runs P; it only needs P's public face to hand off. This only works because the registry entry for P is an inspectable value that can be passed into another program's arguments.

The interpreter never encodes this composability. It emerges from the data model.

---

## The Plugin System (v3)

### Architecture

Each supported harness gets a **plugin** that implements a standard interface:

```typescript
interface HarnessPlugin {
  name: string;
  supportedModels: string[];

  // Inject the HUD into the harness's native prompt/system-prompt format
  injectHUD(hud: HUD): string;

  // Spawn a child session and return the result
  spawn(config: SpawnConfig): Promise<RLMDelta>;

  // Parse the child's raw output into a normalized delta
  parseDelta(rawOutput: string): RLMDelta;

  // Validate that the requested model is supported
  validateModel(model: string): boolean;
}
```

### Plugin Responsibilities

Each plugin encapsulates:

- **HUD injection**: How to wire the HUD into the harness's system prompt. Claude Code uses `--append-system-prompt`, opencode uses its own mechanism, etc.
- **Session spawning**: How to actually launch a child session. This may be a subprocess (`claude -p "..."`), an API call, or a native SDK invocation.
- **Return parsing**: How to extract the delta from the child's output. Different harnesses have different output formats.
- **Model constraints**: Claude Code only supports Anthropic models. opencode supports a broader set. The plugin enforces this and returns a clear error if the caller requests an unsupported model.
- **Error handling**: Timeouts, crashes, malformed returns—each plugin handles these in a harness-appropriate way and normalizes the error back to the caller.

### Cross-Harness Spawning

A critical capability: **a plugin can spawn a child session in a different harness than the one the caller is running in.** This means:

- A Claude Code agent can delegate to an opencode child running Gemini Flash for a fast sub-task.
- An opencode agent can delegate to a Claude Code child for a task that benefits from Claude Code's tooling.
- The RLM Server skill handles the routing—the caller just specifies `harness: "opencode"` and the server invokes the appropriate plugin.

This enables **cost optimization** (use expensive models where they matter, cheap ones elsewhere) and **capability routing** (use the harness best suited to the sub-task).

---

## The Return as a HUD Delta

### Concept

The child RLM does not return a freeform result. It returns a **delta to the HUD slice it was given**. This is the "kaleidoscope zoom-in" pattern:

1. The parent zooms into a specific slice of its HUD.
2. The parent passes that slice to the child with a responsibility and return contract (expressed as `ensures` and `requires`).
3. The child works within that scoped context.
4. The child returns only what changed—the delta—along with provenance metadata showing who changed what.
5. The parent composes the delta back into its own HUD.

### Provenance Tracking

Every delta carries provenance metadata so that outer layers can reason about what came from where:

- **Which layer** made the change (depth in the recursion tree).
- **Which model** produced it.
- **Which harness** was used.
- **Which ensures were satisfied** and which requires were consumed.

This lets the parent distinguish between its own observations and child-produced updates, and make informed decisions about trust and verification.

### Ensures and Requires as the Delegation Contract

The `ensures` and `requires` blocks from OpenProse map naturally onto the HUD's responsibility and return contract:

- **Requires**: What the child needs from the parent (the preconditions—what context, permissions, environment data must be present).
- **Ensures**: What the child promises to deliver back (the postconditions—what the delta will contain, what guarantees it makes).

This creates a **formal contract between layers**: the parent sets up the requires, the child satisfies the ensures, and the delta is the proof of fulfillment.

---

## Turning a ReAct Harness into an RLM

### The Transformation

The key insight: **a prompt transforms your existing harness into an RLM.** You don't need to rebuild the harness. You need:

1. The **RLM Server skill** installed in the harness.
2. A **system prompt overlay** that reframes the agent's behavior from "linear ReAct explorer" to "RLM node that knows how to delegate and return deltas."

The prompt overlay teaches the agent:

- That it exists within a recursive hierarchy.
- That its HUD is a scoped view, not the whole world.
- That it has a responsibility and return contract to fulfill.
- That it can delegate sub-tasks via the RLM Server.
- That when it's done, it returns a delta (not a freeform answer) via the Return action.
- When to delegate vs. when to keep exploring locally.

### Starting Point: opencode

The initial implementation targets **opencode** as the first harness, chosen for its flexibility, broader model support, and structural readiness for this kind of augmentation.

---

## Distribution

### v1 — Skill Only

The v1 distribution is a **single skill directory** (`skills/rlmify/` in this repo) containing only the interpreter: SKILL.md plus the minimum companion files describing the HUD structure, delegation primitive, and return contract. Install the skill in a supported harness (currently pi), and that harness becomes RLM-capable for any program you hand it. Programs are distributed separately—either bundled with applications or published as their own artifacts.

### v2/v3 — Skill + Runtime

Later versions bundle the SDK integration and/or the multi-harness orchestrator alongside the interpreter. The skill itself remains the shipped artifact; the runtime binary is a dependency the skill invokes when available and falls back from when not. The goal is that a caller never has to reason about which packaging tier is active: the interpreter-facing surface (how you author programs, what a HUD looks like) is stable across v1/v2/v3.

---

## Open Questions

1. **Registry resolution mechanics (v1)**: In v1 the program itself resolves registry references to program bodies via bash. What's the cleanest convention—flat directory with filenames? A known lookup path like `./programs/`? A manifest file?
2. **Registry merge semantics**: When a child returns registry additions in its delta, should the parent merge them by default, require explicit acceptance, or gate by some trust policy?
3. **Plugin discovery (v3)**: Should the runtime auto-detect which harnesses are available on the system, or should the caller always specify explicitly?
4. **Concurrency model**: When the outer agent fans out multiple child RLMs, should the runtime manage parallelism, or does the caller orchestrate that in code?
5. **Delta composition conflicts**: When multiple children return deltas to overlapping parts of the HUD, how are conflicts resolved? Last-write-wins? Merge? Escalate to parent?
6. **Streaming deltas**: Should children be able to stream partial deltas back to the parent as they work, or is the return always atomic? Blocked in v1 by stdout parsing; naturally unblocked in v2 via SDK event streams.
7. **Security / sandboxing**: Can a child RLM escape its scoped HUD? Should the runtime enforce read/write permissions on which HUD fields the child can modify? Does the registry need a trust-boundary concept?
8. **OpenProse integration**: The `ensures`/`requires` contract maps directly onto OpenProse. The full integration path—where the RLM interpreter and OpenProse orchestration coexist, and how Forme-style eager wiring interoperates with late-bound resolution—needs a follow-up document.
