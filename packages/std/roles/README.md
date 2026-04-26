# std/roles

Standard role definitions for OpenProse services. Each role is a reusable
behavioral contract that declares typed ports, effects, and executable prose
instructions. Roles are the atoms; programs, controls, and composites are
assembled from them.

Every role is runnable through the same local meta-harness as an application
component:

```bash
bun run prose run packages/std/roles/summarizer.prose.md \
  --input content="Decision: ship the examples tour." \
  --input preserve='{"items":["Decision"]}' \
  --output summary="Decision: ship the examples tour."
```

Deterministic `--output` fixtures exist for development/testing. Real execution
runs the same typed port contract and the role's `### Execution` instructions
through the Pi graph VM.

## Roles by Category

### Analysis

| Role | Description |
|------|-------------|
| [classifier](classifier.prose.md) | Assign a category label and confidence from a declared taxonomy |
| [critic](critic.prose.md) | Evaluate a work product against subjective quality criteria |
| [verifier](verifier.prose.md) | Check a result against objective constraints and return pass/fail evidence |

### Transformation

| Role | Description |
|------|-------------|
| [extractor](extractor.prose.md) | Pull JSON-structured evidence from unstructured input |
| [summarizer](summarizer.prose.md) | Compress content while preserving caller-declared information |
| [formatter](formatter.prose.md) | Render structured data into a target presentation format |

### Creation

| Role | Description |
|------|-------------|
| [researcher](researcher.prose.md) | Investigate a topic and return sourced, confidence-scored findings |
| [writer](writer.prose.md) | Produce a written artifact for a specific audience and format |
| [planner](planner.prose.md) | Produce ordered work with dependencies, decisions, and fallbacks |

### Flow

| Role | Description |
|------|-------------|
| [router](router.prose.md) | Select the best handler from candidate capabilities and explain the choice |

## Decision Matrix

| When you need to... | Use |
|------|-----|
| Label an input against a known taxonomy | **classifier** |
| Judge whether work meets a quality bar | **critic** |
| Check formal correctness against rules | **verifier** |
| Lift structured fields from raw text | **extractor** |
| Compress content without losing key points | **summarizer** |
| Reshape data into Markdown, JSON, HTML, CSV | **formatter** |
| Discover information via search or tools | **researcher** |
| Create a new document, report, or email | **writer** |
| Sequence work into an ordered plan | **planner** |
| Dispatch a request to the right handler | **router** |

## Common Confusions

**Classifier vs. Router.** Classifier produces a label (data). Router selects a handler (action). A classifier says "this is a billing question." A router says "send this to the billing service."

**Critic vs. Verifier.** Critic renders subjective quality judgments ("is this analysis thorough?"). Verifier checks objective formal constraints ("does this JSON match the schema?"). A result can pass verification and fail criticism, or vice versa.

**Extractor vs. Formatter.** Extractor goes from unstructured to structured (raw text to schema). Formatter goes from structured to structured (data to Markdown). They point in opposite directions.

**Summarizer vs. Writer.** Summarizer compresses existing content. Writer creates new content. If the input already contains the information and you need less of it, use summarizer. If you need to synthesize, argue, or explain, use writer.

**Researcher vs. Extractor.** Researcher discovers new information using tools and search. Extractor lifts information already present in its input. If the data is in the input, extract. If the data needs to be found, research.
