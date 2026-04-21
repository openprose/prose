---
purpose: OpenProse example programs in Contract Markdown and ProseScript
related:
  - ../README.md
  - ../guidance/README.md
---

# OpenProse Examples

These examples demonstrate OpenProse's two authoring surfaces: Contract Markdown (`.md` files with contracts, shapes, and strategies) and ProseScript (`.prose` files or `### Execution` blocks for pinned choreography).

## Contract Markdown Examples (.md)

### Basics -- Single-Service Programs

| File | Description |
|------|-------------|
| `01-hello-world.md` | Simplest possible program -- a single service with no inputs |
| `02-research-and-summarize.md` | Research a topic and produce a summary with strategies |
| `03-code-review.md` | Multi-perspective code review as a single service |
| `04-write-and-refine.md` | Draft and iteratively improve content using strategies |

### Multi-Service Programs (Auto-Wired by Forme)

| Directory | Description |
|-----------|-------------|
| `09-research-with-agents/` | Research pipeline with specialized researcher and writer services |
| `16-parallel-reviews/` | Parallel security, performance, and style reviews with synthesizer |
| `30-captains-chair-simple/` | Captain coordinates executor and critic with shapes |
| `32-automated-pr-review/` | Multi-agent PR review with security, performance, and style |
| `34-content-pipeline/` | Full content creation pipeline: research, write, edit, social media |
| `40-rlm-self-refine/` | Worker-critic composite: refine until quality threshold |
| `41-rlm-divide-conquer/` | Map-reduce: chunk, analyze, synthesize for large inputs |
| `42-rlm-filter-recurse/` | Filter-then-process for needle-in-haystack tasks |
| `43-rlm-pairwise/` | Pairwise comparison and relationship mapping |

### Execution Block Programs (Level 3)

| Directory | Description |
|-----------|-------------|
| `29-captains-chair/` | Full captain's chair with research, implementation, and review phases |
| `33-pr-review-autofix/` | PR review with auto-fix loop |
| `35-feature-factory/` | Feature implementation: design, implement, test, document |
| `36-bug-hunter/` | Bug investigation: evidence, hypotheses, fix, verify |
| `37-the-forge/` | Build a web browser from scratch -- 9-phase pipeline |
| `39-architect-by-simulation/` | Design systems through simulated implementation phases |
| `47-language-self-improvement/` | Analyze a ProseScript corpus to evolve the language |

### Feature Demonstrations

| File | Description |
|------|-------------|
| `11-skills-and-imports.md` | Registry imports |
| `12-secure-agent-permissions.md` | Shapes as permission boundaries |
| `13-variables-and-context.md` | Auto-wiring from `### Requires` to `### Ensures` |
| `22-error-handling/` | Conditional ensures and declared errors |
| `23-retry-with-backoff.md` | Strategies for resilient calls |
| `24-choice-blocks.md` | Conditional ensures as a declarative alternative to `choice` |
| `25-conditionals.md` | Conditional ensures as a declarative alternative to `if/elif/else` |

### Production Workflows

| Directory | Description |
|-----------|-------------|
| `38-skill-scan/` | Security scanner for AI assistant skills/plugins |
| `44-run-endpoint-ux-test/` | Concurrent UX testing of the /run API endpoint |
| `45-plugin-release/` | Plugin release workflow with validation and rollback |
| `46-workflow-crystallizer/` | Extract workflow patterns from conversations into .prose |
| `48-habit-miner/` | Mine AI session logs for patterns, generate automations |
| `49-prose-run-retrospective/` | Analyze completed runs for learnings and improvements |
| `50-interactive-tutor.md` | Interactive tutoring with conditional ensures |

### Native Contract Markdown Examples

| File | Description |
|------|-------------|
| `test-demo.md` | Demonstrates `kind: test` with fixtures and assertions |
| `registry-import/` | Demonstrates importing services from the registry |
| `wiring-declaration.md` | Demonstrates Level 2 explicit wiring (`### Wiring`) |
| `multi-service-single-file.md` | Demonstrates `##` heading delimiters for multiple services |
| `composites-demo/` | Demonstrates a self-contained worker-critic composite pattern |

## ProseScript Archive

Historical `.prose` files are preserved in the archive for reference. They continue to run via `prose run file.prose`.

## Running Examples

Run any Contract Markdown example from inside an agent session:

```text
prose run examples/01-hello-world.md
prose run examples/16-parallel-reviews/
prose run examples/37-the-forge/
```

Run a Contract Markdown test:

```text
prose test examples/test-demo.md
```

## Counts

- **Wrapped in Contract Markdown:** 35 programs
- **Archived (retired):** 15 programs + roadmap/
- **Native Contract Markdown:** 5 examples
