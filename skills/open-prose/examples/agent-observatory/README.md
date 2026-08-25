# agent-observatory

**Standing goal:** keep a live, auditable index of every local agent session
(across Claude Code, Codex, OpenCode, and Pi) and a dual Markdown + HTML
dashboard that only re-writes when some session state actually changed.

**One-line scenario:** many cheap watchers, one expensive synthesis. Your laptop
is already a sprawling multi-runtime agent state machine; this observatory turns
that mess into maintained world-models (sessions, summaries, workstreams,
concepts, an extracted `.prose` program, Markdown, and HTML), and proves that
the expensive synthesis only wakes on a real surprise.

This is the **multi-agent observatory** flagship: independent per-runtime facet
tokens (the dark lane), quiet watchers, a diamond fan-in woken exactly once, a
batched expensive synthesis gated on surprise, the folded-in **Session to Prose**
meta-generator as a standing node, and dual MD + HTML artifacts.

## The DAG (14 nodes / 22 edges)

```text
                         Agent FS (external)
                              │ @atomic
                              ▼
                       Runtime Watch  ── one INDEPENDENT facet per runtime ──┐
        claude │   codex │   opencode │   pi                                 │
          ▼        ▼         ▼          ▼                                     │
   Claude Ad.  Codex Ad.  OpenCode Ad. Pi Ad.   ← quiet watchers (mostly dark)
          └────────┴──────────┴─────────┘ @atomic
                              ▼
                       Session Ledger  ── one facet per session:<id> ──┐
        session:claudeA │ session:claudeB │ session:codexA            │
          ▼                 ▼                  ▼                       │ session:claudeA
   Summary[claudeA]   Summary[claudeB]   Summary[codexA]        Session → Prose
          └────────────────┴──────────────────┘ @atomic                │ @atomic
                              ▼  (DIAMOND, woken once)                  │
                       Workstream Index ── rollup · cluster-gate        │
                       cluster-gate │        │ rollup                   │
                              ▼                                         │
                     Concept Clusterer (batched, expensive)            │
                              │ @atomic            │ rollup             │
                              ├────────────────────┼────────────────────┘
                              ▼                    ▼
                     Agent Dashboard (HTML)   Agent Index (Markdown)
```

- **The dark lane:** the gateway exposes one INDEPENDENT facet token per runtime.
  A single Claude session edit moves only the `claude` token, so only the Claude
  Adapter lane lights; the three sibling adapters stay dark. The Session Ledger
  repeats the trick per session.
- **The diamond:** the three per-session summaries fan into the Workstream Index;
  a two-session delta wakes the index exactly once.
- **The batch gate:** the Concept Clusterer subscribes only to the
  `cluster-gate` facet (the distinct-workstream set), so it stays dark on small
  deltas and spends the single tall fresh spike only on a "major new project".
- **The fold-in:** Session to Prose watches one Claude transcript and maintains a
  generalized `.prose` contract, feeding the Markdown index.
- **Dual artifacts:** Agent Index (Markdown) + Agent Dashboard (HTML) re-render
  together only when DashboardData moved.

## Conformance expectations

A conforming harness proves deterministic replay, quiet memo-skips, one-runtime
lane isolation, one wake at the diamond fan-in, and a single expensive concept-
clusterer spike only when its gate moves.

## Replay any run you produce

A run leaves a real, chain-verifiable state on disk: the compiled topology, the
flat receipt ledger, and per-node world-models. Any conforming harness can
replay it with no model key to walk the cold cascade, the quiet flat line, the
one-runtime delta, the diamond single-wake, and the single tall
Concept-Clusterer spike.
