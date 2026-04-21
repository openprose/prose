# std/roles

Standard role definitions for OpenProse services. Each role is a reusable behavioral contract that defines what a service does, what it requires, and what it guarantees. Roles are the atoms -- everything else is molecules.

## Roles by Category

### Analysis

| Role | Description |
|------|-------------|
| [classifier](classifier.md) | Assign a category label to an input given a defined category set |
| [critic](critic.md) | Evaluate a work product against quality criteria and render a subjective verdict |
| [verifier](verifier.md) | Check a result against formal constraints and report pass/fail for each |

### Transformation

| Role | Description |
|------|-------------|
| [extractor](extractor.md) | Pull structured data from unstructured input given a target schema |
| [summarizer](summarizer.md) | Compress content while preserving specified key information |
| [formatter](formatter.md) | Transform structured data into a specified output format with no information loss |

### Creation

| Role | Description |
|------|-------------|
| [researcher](researcher.md) | Investigate a topic using available tools and return sourced, confidence-scored findings |
| [writer](writer.md) | Produce a written artifact given requirements, audience, and constraints |
| [planner](planner.md) | Produce an ordered plan with dependencies, decision points, and fallback paths |

### Flow

| Role | Description |
|------|-------------|
| [router](router.md) | Select the best handler for an input from a set of candidates and explain the choice |

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
