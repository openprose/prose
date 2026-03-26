# Codex Run Prompt

Use this as a starting prompt in Codex when you want the root session to act as the OpenProse VM.

```text
Execute {RECIPE_OR_PATH} as OpenProse.

Use this root session as the VM.
Use ~/.codex/prose-aliases.toml as the alias registry.
Use `prose_component` for child workflows.
Use `prose_leaf_auditor` for named `audit-agents`.
Create `.prose/runs/{timestamp}-{rand}/` for state.
Write outputs only under `.prose/runs/`.
If a referenced skill resolves to SKILL.md, read and apply it.
If a referenced child workflow resolves to .prose.md, .prose, or program-like .md, delegate to `prose_component`.
If a reference is unresolved, report the exact missing ids and stop only that branch.
Parallelize sibling branches conservatively within runtime limits.
Return the final output, unresolved references, and a short execution trace.
```
