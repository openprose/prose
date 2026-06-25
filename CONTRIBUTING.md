# Contributing to OpenProse

OpenProse is a programming language for AI sessions, expressed as durable
Markdown contracts. Good contributions make agent workflows more readable,
reviewable, versioned, reusable, inspectable, and cheaper to trust over time.

This repository is the open-source language, skill, CLI, standard library, and
examples. It is not the hosted product roadmap, billing surface, subscription
marketplace, or private operating plan. Contributions should strengthen the
public substrate that any Prose Complete host can run.

## Contribution Bar

A strong OpenProse PR should:

- Start from a concrete use case or run observation. Name the workflow, agent
  failure mode, customer-shaped need, or completed run that made the change
  necessary.
- Address one responsibility. If the work fixes docs, CLI behavior, and a std
  pattern independently, open separate PRs.
- Respect the language/framework/harness boundary. Put semantics in the skill
  and interpreter docs, reusable contracts in `packages/std/`, and deterministic
  harness behavior in `packages/reactor*/`.
- Make the library more developer-friendly and agent-friendly at the same time:
  clearer for humans to review, easier for agents to execute correctly.
- Add or identify a retestable mechanism. Use existing tests when they cover
  the change; add a focused test or eval when they do not.
- Reduce sprawl. Prefer one precise contract, example, test, or CLI behavior
  over a broad feature sweep.

## Project Tenets

Use these when deciding whether a change belongs:

- **Markdown source defines intent.** Authored `*.prose.md` files say what must
  be true; runtime and harness code should not smuggle in semantic policy.
- **Outcomes stay decoupled from implementation.** Users declare the result or
  desired state; OpenProse can improve models, judges, retries, and program
  structure beneath that contract without changing the user's intent.
- **The skill and interpreter docs define semantics.** Contract Markdown,
  Forme, Prose VM, ProseScript, and Responsibility Runtime are the load-bearing
  language/framework surface.
- **The harness serves IR and launches runs.** The CLI can validate, compile,
  serve local triggers, forward commands to a selected harness, and report
  deterministic status. It should not become a second VM.
- **Contracts before choreography.** Prefer `### Requires`, `### Ensures`,
  `### Errors`, `### Invariants`, `### Shape`, and `### Strategies`; use
  `### Execution` only when order, loops, retries, gates, or branches are
  actually part of the requirement.
- **Services stay isolated.** Services write private scratch to `workspace/`;
  only declared outputs become public `bindings/`.
- **Forme wires; services do not discover each other.** Services declare data
  they require and ensure. Wiring belongs to Forme manifests or explicit
  `### Wiring` when ambiguity must be pinned.
- **Responsibilities are standing goals, not cron jobs.** Keep the source
  semantic; compile and serve lower it into triggers, activations, status, and
  pressure.
- **Harness and model agnostic by default.** A change should work across Prose
  Complete hosts unless it is explicitly in a host adapter or CLI harness.
- **The public OSS repo remains disciplined.** Hosted product concepts such as
  billing, subscriptions, royalties, subscriber identity, and amortization
  economics belong outside the language unless a minimal public hook becomes
  necessary later.

## Where Changes Belong

| Change | Put It Here | Notes |
| --- | --- | --- |
| Contract syntax, section meaning, authored kinds | `skills/open-prose/contract-markdown.md` | Keep examples current and agent-readable |
| Wiring semantics and dependency injection | `skills/open-prose/forme.md` or `packages/std/ops/wire.prose.md` | Specs define behavior; std contracts expose reusable operations |
| VM execution, run state, bindings, run-typed inputs | `skills/open-prose/prose.md` and `skills/open-prose/state/` | Do not move VM semantics into the CLI |
| Responsibility Runtime, compile/serve/status doctrine | `skills/open-prose/responsibility-runtime.md` and compiler docs | Keep responsibilities semantic; compile creates concrete IR |
| Reusable roles, patterns, evals, ops, delivery, memory | `packages/std/` | Only promote repeated, use-case-agnostic behavior |
| Company-operation starter contracts | `packages/co/` | Opinionated company-as-prose building blocks |
| Agent-facing routing and activation guidance | `skills/open-prose/SKILL.md`, `AGENTS.md` | Keep globally loaded guidance concise |
| Reactor harness: SDK, `reactor` CLI, replay devtools | `packages/reactor*/` | The deterministic harness that compiles and runs Responsibilities; it does not replace the VM |
| Deterministic linting, LSP diagnostics, source identity, and linter conformance fixtures | `crates/openprose-lint/` | Language changes and lint support should land together; keep policy in repo scripts, not workflow YAML |
| Examples that teach a complete pattern | `skills/open-prose/examples/` | Include enough context for an agent to run or adapt them |
| Public contribution/process guidance | `CONTRIBUTING.md` | Keep it public, practical, and aligned with the repo |

## Reactor (`packages/reactor*`)

Reactor is the SDK + CLI + devtools harness that compiles and runs OpenProse
Responsibilities. It lives in a **pnpm monorepo** under `packages/reactor`
(`@openprose/reactor`, the SDK), `packages/reactor-cli` (the `reactor` binary),
and `packages/reactor-devtools` (the keyless replay viewer). Note this is `pnpm`
and per-package scripts.

**Setup and build.** From the repo root:

```bash
pnpm install                              # install the workspace
pnpm -C packages/reactor build            # build a single package
pnpm -C packages/reactor test             # test a single package
```

**Use the offline gate as your default test command.** The plain `pnpm test`
includes **LIVE** tests that reach the model provider — they go red without an
OpenRouter key, or on a `402 Insufficient credits`, even when your change is
correct. The contributor default is the **offline** gate, which runs no model
calls:

```bash
pnpm -C packages/reactor test:offline     # or: REACTOR_OFFLINE=1 pnpm -C packages/reactor test
```

Run `test:offline` (equivalently `REACTOR_OFFLINE=1`) for the commit gate; the
LIVE tests are gated on a funded key and are not expected to pass in a keyless
or out-of-credits environment. State in your PR which gate you ran.

## Testing Expectations

Every PR should say how it was tested. Prefer the narrowest check that can fail
again in the future when the behavior regresses.

| Change Type | Expected Checks |
| --- | --- |
| Reactor SDK or harness behavior | `pnpm --filter @openprose/reactor test` (offline: `REACTOR_OFFLINE=1`), or the narrow affected Vitest file |
| Skill or doc behavior | `pnpm test:skill` |
| Skill/spec docs | Link/structure checks plus a small scenario showing how an agent should route the command or file |
| Linter behavior or language-surface support | `bash scripts/lint-prose.sh`, or the narrow affected `cargo test -p openprose-lint <test-name>` during iteration |
| `*.prose.md` std/co contracts | Structural check for frontmatter and required sections; add or update a `kind: test` when behavior is executable |
| Examples | Run or dry-run the example in a Prose Complete host when practical; otherwise document the missing host capability |
| Docs-only copy | `git diff --check`, link existence checks, and examples reviewed for current command names |

If no deterministic test exists yet, say that plainly in the PR and either add
the smallest useful test or explain why a future eval is the right follow-up.

The root `pnpm lint` command is the whole-repo gate: it runs Reactor package
linting and the Rust-backed OpenProse linter, so it requires the Node/pnpm and
Rust/Cargo toolchains. For a Reactor-only edit, use `pnpm lint:reactor` during
iteration and state that narrower scope in the PR.

### Optional maintainer drift checks

`bash scripts/lint-prose.sh advisory` runs non-blocking linter discovery output.
If `true-up` is available on `PATH`, or if `TRUE_UP_BIN` points to a true-up
binary, the advisory profile also reports the committed `.true-up.json` drift
policy. This is intentionally optional maintainer tooling, not required
contributor setup.

The `OpenProse Lint` GitHub Actions workflow runs the same repository scripts on
pull requests and `main` pushes. Keep linter policy in `scripts/lint-prose.sh`;
the workflow should stay a thin runner that installs toolchains and invokes the
shared gate.

`bash scripts/lint-prose.sh package` is the crate packaging gate for
`openprose-lint`: it lists the Cargo package contents, runs `cargo publish
--dry-run --allow-dirty`, and verifies `specs verify --spec openprose` from the
packaged source tree. Release commits should additionally pass
`bash scripts/lint-prose.sh release-package`, which requires a clean worktree and
omits `--allow-dirty`.

## PR Description Shape

Use progressive disclosure. Maintainers and agents should understand the change
from the top, then dig into examples and verification when needed.

1. **Summary** — what changed in 3-5 bullets.
2. **Use Case / Run Evidence** — why this change exists. Include run IDs,
   issue links, user-visible friction, or a concrete workflow.
3. **Design Boundary** — why the change belongs in the files you touched, and
   why it does not belong in the skill, CLI, stdlib, or hosted product instead.
4. **Examples** — inline before/after snippets, command examples, or a minimal
   `*.prose.md` fragment when the change affects authoring.
5. **Testing** — commands or evals run, plus key results.
6. **Residual Risk / Follow-ups** — what remains intentionally out of scope.

Keep the PR body honest. If the change only improves docs, do not imply runtime
behavior changed. If the change needs a future hosted product feature, name it
as out of scope rather than baking private strategy into the OSS language.

## Agent-Assisted Contributions

If you are an agent and an OpenProse run exposed a concrete improvement, prefer
the standard contributor program:

```bash
prose run std/evals/prose-contributor -- subjects: <run-ids>
```

Use it for small, evidence-backed improvements: docs clarifications, std
contract fixes, eval guardrails, or examples extracted from a real run. It
should read this file, select one PR-sized responsibility, open one focused
draft PR, and include the run evidence plus verification in the PR body.

Do not push or open a PR with the user's GitHub identity unless the user has
explicitly approved that specific contribution. If approval is missing, draft
the diff and ask once.

## When To Open An Issue First

Small, evidence-backed fixes can go straight to PR. Open an issue first when:

- the change alters language semantics or authored syntax
- the change spans multiple responsibilities or packages
- the right layer is unclear
- the proposal depends on hosted product concepts not currently present in the
  OSS repository
- you cannot describe a retestable success condition

## Code Of Conduct

Be respectful and constructive. OpenProse is early and experimental; precise,
evidence-backed feedback helps more than broad taste notes.

## Questions

- GitHub Issues: [github.com/openprose/prose/issues](https://github.com/openprose/prose/issues)
- X/Twitter: [@irl_danB](https://x.com/irl_danB)

Thanks for helping improve OpenProse.
