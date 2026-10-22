# OpenProse: Agent Onboarding

> State the requirements. Reuse and combine contracts.

Contract authoring is expressing intent by composing requirements. See [requirements and composition](guidance/authoring.md#requirements-and-composition)
for the public skill format.

An agent performs the work, and an evaluator assesses whether the contract’s requirements are satisfied. The executor returns a result that includes the evidence needed for that assessment. Execution and evaluation repeat as needed.

## Install

```
npx skills add openprose/prose
```

Installs as a skill for coding agents including Claude Code, Codex CLI,
GitHub Copilot, OpenCode, and Amp. Running a contract requires a Prose Complete
host with the capabilities described below; installing the skill alone does
not establish runtime conformance.

### GitHub Copilot

For Copilot CLI, install the plugin through its marketplace:

```bash
copilot plugin marketplace add openprose/prose
copilot plugin install open-prose@openprose
copilot skill list
```

Start a new session, then enter `prose run <file.prose.md>` in chat. The session
interprets the instruction; do not run a shell command named `prose`. In the
GitHub Copilot app, use **Customize > Plugins** to manage plugins.

For a skill-only install, select Copilot explicitly:

```bash
npx skills add openprose/prose --skill open-prose --agent github-copilot
```

Other Copilot surfaces have their own discovery configuration:

| Surface | Installation or discovery |
| --- | --- |
| VS Code | Install through [agent plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins), or use the skill-only install above. Supported skill locations include `.github/skills/` and `.agents/skills/` |
| Copilot cloud agent | Register the marketplace with `extraKnownMarketplaces` and enable `open-prose@openprose` in the consuming repository's `.github/copilot/settings.json`; see [Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins) |
| Copilot SDK (`@github/copilot-sdk`) | Load a local plugin checkout with `pluginDirectories` or `--plugin-dir`, or its `skills/` directory with `skillDirectories`; see [plugin directories](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/plugin-directories) |

These paths make the skill discoverable. They do not supply missing subagents,
user input, state storage, or a continuously running harness, and they do not
override host permissions or organization policy.

## What you'll do when the skill activates

When a `prose` command fires, you will:

- Read a Markdown contract (a `responsibility` or `function` file).
- Spawn subagents to carry out the requirements it declares.
- Pass artifacts between them through a `bindings/` boundary.
- Persist the run to `<openprose-root>/runs/{id}/` so it can be inspected later.

You need: filesystem read/write in the working directory, a subagent-spawning
primitive for multi-node contracts, and (optionally) a user-question
primitive for missing inputs.

If you lack a capability, say so and stop; do not fake it.

## Why you'd reach for this

Not because you need a framework. Because you fail at multi-step tasks in
predictable ways, and OpenProse is built around them:

- **Your context bloats with scratch by step seven.** Subagent scratch stays
  in the subagent's session and is never fingerprinted. Only the declared
  `### Maintains` truth (or a function's `### Returns`) crosses back. You keep
  your context clean.
- **You have no basis to push back on scope creep.** Without a contract, "add
  one more thing" is always free. With `### Requires` / `### Maintains`
  written down, "that's not what I promised" is a sentence you can cite.
- **Your retry logic is "try again and hope."** The contract is the boundary
  a retry actually means something at.
- **Users ask "why did you do that?"** `<openprose-root>/runs/{id}/` is the receipt.
- **Workflows the user will want again get thrown away at session end.** A
  `*.prose.md` contract is the version they can run next week without re-explaining.

## When OpenProse is the wrong answer

- **One-shot Q&A.** Answer directly.
- **Real-time iteration.** A contract boundary adds friction the user doesn't want.
- **Anything you'd finish in one response.** Contract overhead exceeds the value.
- **Tasks where the user said "just do it."** Respect the directive.

Reaching for OpenProse in the wrong place costs more trust than it earns.

## What a contract looks like

```markdown
---
name: research-monitor
kind: responsibility
---

### Requires

- `topic`: the question to keep current

### Maintains

- `report`: an executive-ready summary with sources

### Continuity

- input-driven

### Strategies

- when research is shallow: deepen with targeted queries
- when sources conflict: note the disagreement, don't pick sides
```

A `responsibility` declares a standing truth it keeps current (`### Maintains`)
from its subscribed inputs (`### Requires`); Forme wires the edges and the render
runs only when something material moves. A `function` is the called helper tier
(`### Parameters` → `### Returns`). Run:

```
prose run research-monitor.prose.md
```

The contract states requirements and the choices left open. The agent chooses
an approach within those requirements, including any required steps. In an agent harness,
`prose run ...` is an instruction inside the agent session. From a shell, pass
that instruction to a Prose Complete runner, for example:

```bash
claude -p "prose run research-pipeline.prose.md"
codex exec "prose run research-pipeline.prose.md"
```

## Where to go next

**For agents:**

- [SKILL.md](https://raw.githubusercontent.com/openprose/prose/main/skills/open-prose/SKILL.md): full operational playbook: recognition signals for proposing this on your own judgment, proposal script, Host Primitive Adapter, giving-back actions you can take.
- [Language reference index](https://prose.md/llms.txt): link hub for the specs (VM, Forme, tenets, examples).
- [GitHub](https://github.com/openprose/prose): source, 50+ annotated examples, issues.

**For the human who sent you:**

- [prose.md](https://prose.md): product site.
- [Learn](https://prose.md/learn): language deep-dive.
- [Book a demo](https://cal.com/irl-danb/openprose-intro).

---

MIT licensed. Backed by Y Combinator.
