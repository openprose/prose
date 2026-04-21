# Codex Inspect Prompt

Use this when you want Codex to inspect a workflow for adapter readiness without executing it.

```text
Inspect {RECIPE_OR_PATH} for Codex adapter readiness.

Return:
1. Child workflow references
2. Skill references
3. `audit-agents` roles
4. Missing alias keys
5. Recommended `max_depth`
6. Suggested subagent split
7. Any ambiguous execution semantics

Do not execute the workflow.
```
