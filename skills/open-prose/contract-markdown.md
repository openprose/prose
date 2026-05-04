# OpenProse Contract Markdown

OpenProse source is `.prose.md`: typed, reviewable contracts that compile to IR.
This document is the canonical reference for what a contract may declare.

## Component Frontmatter

Every `.prose.md` file may begin with YAML frontmatter:

```yaml
---
name: invoice-extractor
kind: system
skills:
  - document-skills:pdf
---
```

Recognized frontmatter keys:

| Key | Required | Notes |
|---|---|---|
| `name` | recommended | Defaults to the filename if omitted. |
| `kind` | recommended | `program`, `service`, `composite`, `test`, or `system`. Defaults to `service`. |
| `skills` | optional | List of agent skills (colon form, e.g. `document-skills:pdf`) the component requires. Equivalent to a `### Skills` section. |

Inline `## subcomponent` headings may carry their own frontmatter block to scope
declarations (kind, skills, etc.) to that sub-component.

## Canonical Sections

A contract is composed of `###` sections. The compiler recognizes the following
canonical section titles:

| Section | Scope | Purpose |
|---|---|---|
| `### Description` | any | Free-form prose describing the component. |
| `### Requires` | any | Typed input ports. |
| `### Ensures` | any | Typed output ports. |
| `### Services` | system | Lists the named sub-services this system composes. |
| `### Skills` | service, system | Names the agent skills (colon form, e.g. `document-skills:pdf`) that must be loaded for this component to run. Also accepted as `skills:` in frontmatter. |
| `### Runtime` | any | Runtime hints (graph VM, model provider, model, thinking, etc.). |
| `### Environment` | any | Environment variables the component needs at run time. |
| `### Effects` | any | Declared side-effects. `pure` is exclusive of all other effects. |
| `### Access` | any | Access rules over inputs/outputs (policy labels, roles). |
| `### Execution` | any | Optional ordered execution body inside a fenced ```prose block. |
| `### Strategies` | any | Free-form notes on how the component achieves its outputs. |
| `### Errors` | any | Declared error codes and descriptions. |
| `### Catch` | any | Free-form recovery guidance. |
| `### Finally` | any | Free-form cleanup expectations. |

Sections not listed here are preserved as documentation but are not parsed into
typed IR fields.

## Skill Declaration

Components may declare the agent skills they require either in frontmatter or in
a `### Skills` section. Both forms are equivalent and are merged (deduped by
declared name) into the component's `skills` list on the IR.

Skill names use the **colon form** that matches the plugin marketplace
convention shown in `/skill` invocations:

```
namespace:name
```

For example, `document-skills:pdf` or `document-skills:xlsx`.

```yaml
---
name: invoice-extractor
kind: system
skills:
  - document-skills:pdf
---

### Skills

- document-skills:pdf
- `document-skills:xlsx`
```

A bare leaf name (e.g. `pdf`) is also accepted; the resolver will attempt a
deterministic Levenshtein fuzzy match against installed skills and emit an
informational diagnostic nudging the author to pin the canonical name.

### Scope

- **System-level** declarations apply to every sub-service inside the system.
- **Service-level** declarations are *additive*, not exclusive — declaring
  `skills:` on a `## sub-service` does not remove the system-level skills, it
  adds to them.

### BYO harness invariant

OpenProse never installs, modifies, or removes the user's harness skills. BYO
harness is sacred. Preflight only verifies the declared skills are present on
the user's machine and fails closed (`skill_unresolved`) when one is missing,
naming the skill and the search paths it looked in. Installing the skill is the
user's responsibility.

Search order for a declared skill is, in order:

1. The project's `./skills/` directory.
2. `~/.claude/skills/`.
3. `~/.codex/skills/`.

Resolved canonical names are pinned into the IR so subsequent runs of the same
IR are reproducible across machines.
