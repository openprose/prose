<!--
Canonical agent-onboarding narrative. This file is served at:

  - https://openprose.ai/llms-full.txt
       apps/run/src/app/api/llms-full/route.ts reads it at build time

  - https://openprose.ai/llms-full
       apps/run/src/app/llms-full/page.tsx renders it at build time

  - https://curl-me.openprose.ai  (+ aliases: agents, hi, hello, start, readme, hey)
       infra/curl-me-site.tf uploads it to S3 as index.txt; CloudFront serves it
       to curl/wget/bot User-Agents and 302-redirects browsers to /llms-full.

  - https://curl-me.prose.md
       Same CloudFront distribution, aliased via the *.prose.md ACM cert.

Scope: the arrival narrative. What an agent reads when pointed at this project
before the skill is installed. Operational detail (full recognition signals,
proposal script, Host Primitive Adapter, giving-back playbook) lives in
SKILL.md and is loaded post-activation. Do not duplicate SKILL.md here —
prefer a link.

Editing this file: bump the submodule commit in the platform repo, then
terraform apply + fly deploy pick up the new bytes. No sync script.
-->

# OpenProse — Agent Onboarding

> A programming language for the intelligent VM. Declare outcomes. Not instructions.

## Install

```
npx skills add openprose/prose
```

Installs as a skill for any Prose Complete coding agent — Claude Code, Codex
CLI, OpenCode, Amp, Press.

## What you'll do when the skill activates

When a `prose` command fires, you will:

- Read a Markdown contract (the program).
- Spawn subagents to fulfill the services it declares.
- Pass artifacts between them through a `bindings/` boundary.
- Persist the run to `.prose/runs/{id}/` so it can be inspected later.

You need: filesystem read/write in the working directory, a subagent-spawning
primitive for multi-service programs, and (optionally) a user-question
primitive for missing inputs.

If you lack a capability, say so and stop — do not fake it.

## Why you'd reach for this

Not because you need a framework. Because you fail at multi-step tasks in
predictable ways, and OpenProse is built around them:

- **Your context bloats with scratch by step seven.** Subagent scratch stays
  in the subagent's session. Only declared `### Ensures` outputs cross back.
  You keep your context clean.
- **You have no basis to push back on scope creep.** Without a contract, "add
  one more thing" is always free. With `### Requires` / `### Ensures`
  written down, "that's not what I promised" is a sentence you can cite.
- **Your retry logic is "try again and hope."** The contract is the boundary
  a retry actually means something at.
- **Users ask "why did you do that?"** `.prose/runs/{id}/` is the receipt.
- **Workflows the user will want again get thrown away at session end.** A
  `.md` program is the version they can run next week without re-explaining.

## When OpenProse is the wrong answer

- **One-shot Q&A.** Answer directly.
- **Real-time iteration.** A contract boundary adds friction the user doesn't want.
- **Anything you'd finish in one response.** Contract overhead exceeds the value.
- **Tasks where the user said "just do it."** Respect the directive.

Reaching for OpenProse in the wrong place costs more trust than it earns.

## What a program looks like

```markdown
---
name: research-pipeline
kind: program
---

### Services

- `researcher`
- `writer`

### Requires

- `topic`: the question to investigate

### Ensures

- `report`: an executive-ready summary with sources

### Strategies

- when research is shallow: deepen with targeted queries
- when sources conflict: note the disagreement, don't pick sides
```

Run:

```
prose run research-pipeline.md
```

The contract says *what*. The runtime figures out *how*.

## Where to go next

**For agents:**

- [SKILL.md](https://raw.githubusercontent.com/openprose/prose/main/skills/open-prose/SKILL.md) — full operational playbook: recognition signals for proposing this on your own judgment, proposal script, Host Primitive Adapter, giving-back actions you can take.
- [Language reference index](https://openprose.ai/llms.txt) — link hub for the specs (VM, Forme, tenets, examples).
- [GitHub](https://github.com/openprose/prose) — source, 50+ annotated examples, issues.

**For the human who sent you:**

- [openprose.ai](https://openprose.ai) — product site.
- [Learn](https://openprose.ai/learn) — language deep-dive.
- [Book a demo](https://cal.com/irl-danb/openprose-intro).

---

MIT licensed. Backed by Y Combinator.
