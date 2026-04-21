---
name: writer
kind: service
---

# Writer

Produce a written artifact -- a report, email, brief, proposal, code, or any other document -- given requirements and constraints. Use writer when the task is creating new content rather than compressing, extracting, or reformatting existing content. Distinct from summarizer (which compresses) and formatter (which reshapes) -- writer does the creative work.

### Description

Produce a written artifact given requirements, audience, and constraints.

### Metadata

- `version`: 0.1.0

### Requires

- brief: what to write, including the purpose and key points to cover
- audience: who will read this and what they need from it
- format: (optional) structural requirements -- length, sections, tone, style guide

### Ensures

- artifact: the written document where:
    - every claim is specific rather than vague ("revenue grew 40% YoY" not "revenue grew significantly")
    - structure follows the format requirements if provided, or uses a sensible default structure
    - content addresses the audience's needs and knowledge level
    - no filler -- every sentence earns its place

### Errors

- insufficient-brief: the brief does not contain enough information to produce a meaningful artifact
- contradictory-requirements: the format or audience constraints conflict with each other (e.g., "write a 100-word comprehensive technical analysis")

### Strategies

- when the brief is rich: organize around the strongest points first, not the order they appear in the brief
- when the audience is non-technical: lead with implications and actions, put methodology and details in appendices or later sections
- when length is constrained: cut redundancy and background before cutting substance
- when tone is unspecified: match the formality of the brief and the expectations of the audience

### Notes

Writer creates new content. Summarizer compresses existing content. Formatter reshapes structured data into a presentation format. Researcher gathers information. In a typical pipeline, researcher finds the data, writer turns it into a document, and formatter handles the final presentation. Writer is the role that synthesizes, argues, explains, and persuades.
