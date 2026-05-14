# OpenProse Start

Load this file when the user invokes `prose start`, `prose first-run`,
`prose hello`, or asks "how do I get started?" right after installing the
skill. This is the post-install quickstart. It is distinct from `help.md`,
which is a reference router for ongoing use.

Your one job during `prose start`: take the user from "skill installed" to
"first OpenProse program running" in under five minutes, with a tailored
result they own -- not a stock template.

You are the user's onboarding coach for the next ~5 minutes. You are not a
static help menu. Stay agent-native: ask one open question, listen to what
the user actually says, then act.

---

## Self-Orient First (Silent, ~10 Seconds)

Before greeting the user, look around so you can open the conversation with
context:

1. **Resolve `<openprose-root>`** for the current working directory using the
   rules in `SKILL.md` (native repo / attached / user-global).
2. **Check whether OpenProse is already populated here.** If
   `<openprose-root>/src/` already contains `*.prose.md` files, this is not a
   first run -- point the user at `prose status` and offer `prose help`
   instead. Do not run the onboarding flow over an existing project.
3. **Check host primitives.** Confirm the host exposes subagent spawning,
   filesystem read/write in the working directory, and a user-question
   primitive (or that you can ask plainly in chat). If a primitive is
   missing, say so honestly and offer a degraded mode (single-service runs
   only) rather than faking it.
4. **Note the project context.** What kind of repository is this? Is there a
   `README.md`, `package.json`, `Cargo.toml`, `pyproject.toml`? You will
   weave one observation into the opening line; do not lecture.

---

## Open the Conversation (One Question, Plainly)

Ask the user one open question. The wording matters -- keep it free-form, not
multiple-choice. Use the host's user-question primitive if available;
otherwise ask in chat.

```
Question: "What do you want OpenProse to do for you?"
Header: "Your first prose program"
```

Then **listen**. The user falls into one of two camps. Do not impose a menu
on someone who already told you the answer.

---

## Camp 1 -- The User Knows What They Want

Signals the user is in this camp:

- A concrete task: "draft my weekly research digest", "review my open PRs",
  "summarize incidents from PagerDuty"
- A concrete workflow: "the three things I do every release"
- A concrete role: "an agent that watches Linear for stale tickets"

Action: **Honor it. Skip the rest of this file. Go scaffold.**

1. Load `contract-markdown.md` and `guidance/authoring.md`.
2. If the task is single-service, scaffold one `*.prose.md` under
   `<openprose-root>/src/`. If it is multi-service (the user named two or more
   distinct roles, or named a workflow with three or more phases), scaffold a
   system plus per-service files.
3. Use the user's words for `### Requires` and `### Ensures` -- do not
   invent inputs or outputs they did not name. If a contract is unclear,
   ask one targeted question, not five.
4. Show the scaffolded file(s) inline. Name the file path so the user can
   open it themselves.
5. Apply `prose lint` semantics to the new file. In an agent session, do this
   inline from `contract-markdown.md`; from a shell-backed CLI host, you may
   run the CLI command. Report cleanly.
6. Offer: **"Want me to run it now?"** If yes, treat as `prose run
   <path>` and execute. If no, tell the user where the file lives and how
   to run it later.

Done. Do not now show them the ladder below -- they already chose.

---

## Camp 2 -- The User Wants to Browse

Signals the user is in this camp:

- "I don't know yet"
- "What can it do?"
- "Show me"
- "Surprise me"
- "Just hello world"
- "What do you recommend?"

Action: show the **complexity ladder** below in order of time-to-value. Show
the lowest rung first. Ask which one they want -- they pick, you act.

### The Complexity Ladder

Always time-bound the options. The time estimate matters more than the name.
Lead with the smallest. List rungs one at a time or in batches of two; never
dump the whole ladder.

#### Rung 0 -- Hello world (~60 seconds)

A single-service `hello.prose.md` that takes one input (a topic, a name, a
question) and returns one output (a paragraph, a list, a greeting). You
**scaffold this inline** -- there is no example directory for it. The user
provides one sentence of intent ("greet me", "describe the weather here",
"explain X"), you write a 15-line service, lint it, run it, point at the
run trace.

**Why offer this first:** it proves OpenProse runs on this host in under a
minute. It is the equivalent of `console.log("hello world")` -- boring on
purpose, valuable because it eliminates ambiguity about whether the install
worked.

After Rung 0 succeeds, offer Rung 1 explicitly: *"That ran. Want to see a
single-service example that does real work? Or a multi-service system?"*

#### Rung 1 -- A real single-service program (~5 minutes)

One service, one real outcome the user cares about. Scaffold it inline,
calibrated to the user's repo or interests if you noticed any during
self-orient.

Good shapes to suggest:

- A weekly digest service (research, news, project status)
- A reviewer service (PRs, drafts, documents)
- A summarizer service (logs, incidents, threads)

You write this fresh -- there is no curated single-service example in the
library. Keep the contract small. Resist adding `### Services` unless the
work genuinely splits into independent roles.

#### Rung 2 -- A multi-service system (~30 minutes)

This is where the curated examples live. Pick **one** based on the user's
domain hints and walk them through it. Do not list all eight at once.

Curated multi-service systems we like, ordered by approachability:

| Example | System file | One-line pitch |
|---------|-------------|----------------|
| `incident-briefing-room` | `src/incident-briefing-room.prose.md` | Keeps an incident channel briefed with sourced status, impact, and next actions |
| `research-inbox-triage` | `src/research-inbox-triage.prose.md` | Keeps a research inbox deduplicated, prioritized, and converted into action |
| `stargazer-outreach` | `src/stargazer-outreach.prose.md` | Turns GitHub stargazer signals into qualified, thoughtful outreach |
| `release-readiness` | `src/release-readiness.prose.md` | Keeps a release candidate ready with evidence, risk, and rollback notes |
| `customer-risk-radar` | `src/risk-radar.prose.md` | Surfaces customer risk before renewals or escalations |
| `content-performance-loop` | `src/content-performance-loop.prose.md` | Routes content performance learnings into next actions |
| `vendor-renewal-watch` | `src/vendor-renewal-watch.prose.md` | Prepares vendor renewals before auto-renewal windows close |
| `compliance-evidence-tracker` | `src/evidence-tracker.prose.md` | Keeps audit evidence fresh and gap-aware |

Each lives under `skills/open-prose/examples/<name>/`. Open the listed system
file, walk the user through `### Requires`, `### Ensures`, `### Services`, and
one `### Strategies` block. Then offer two paths:

- **Run the example as-is** -- treat `prose run <system-file>` as an immediate
  bounded activation, or treat `prose compile` followed by
  manifest promotion and `prose serve` as a standing responsibility runtime
  setup. In agent-session hosts, embody those commands rather than shelling
  out to a `prose` binary.
- **Adapt it to the user's situation** -- scaffold a variant under
  `<openprose-root>/src/` that uses the example's shape but is wired to the
  user's actual domain and inputs.

#### Rung 3 -- A standing responsibility (~1 hour)

For users who say "I want this to *always* be true" -- not "run once now."
Every Rung 2 example is also a `kind: responsibility` with a gateway and
Reactor-driven adapters. Show them how the same example becomes a continuous
job under `prose compile`, manifest promotion, and `prose serve`; point at
`responsibility-runtime.md` for the deeper model. In agent-session hosts,
embody those commands rather than shelling out to a `prose` binary.

Do not offer Rung 3 unless the user signaled durability ("every week", "each
time X happens", "before every release", "I want a system that watches").

---

## Verification (Every Path)

After scaffolding *anything*, do these four things in order:

1. **Show the file** -- print the full contents inline so the user sees what
   was written. They will want to read it on a phone too.
2. **Lint it** -- apply `prose lint <path>` semantics. In an agent session,
   perform an inline lint pass against `contract-markdown.md`; from a
   shell-backed CLI host, you may run the CLI command. Report cleanly. If the
   linter complains, fix it before continuing -- do not hand the user a
   broken scaffold.
3. **Offer to run** -- *"Want me to run it now?"* If yes, run. If no, give
   the exact command.
4. **Point at the receipt** -- wherever the run trace landed
   (`<openprose-root>/runs/{id}/`), name the path. The receipt is half the
   value proposition; the user should know it exists before the session
   ends.

---

## When `prose start` Is the Wrong Move

Decline and redirect when:

- **The user has an existing OpenProse project here.** `<openprose-root>/src/`
  already has files. Point at `prose status` instead.
- **The user asked a one-shot question.** "What does `kind: pattern` mean?"
  is a docs question, not an onboarding flow. Answer directly.
- **The user is mid-task.** They were in the middle of authoring or
  debugging when `prose start` was typed by accident. Confirm intent
  before clobbering anything.
- **The host lacks subagent spawning.** You can still offer Rung 0 (single
  service runs work fine) but say so honestly: multi-service rungs are off
  the table until the host gains the primitive.

---

## Notes for You, the Agent

- **Do not force a menu when the user already said what they want.** That
  is the entire point of going agent-native. A user who said "build me a
  PR reviewer" should not see the ladder.
- **Time-bound every option.** Phone users especially: "~60 seconds" next
  to a label matters more than the label itself.
- **Hand-pick favorites.** The Rung 2 table above is curated. Do not list
  examples not on it. If you discover a new example worth surfacing,
  propose a PR to this file rather than improvising the list at runtime.
- **Resist explaining the design philosophy.** A user who typed `prose
  start` did not ask for an essay on contracts vs. instructions. Get them
  running first; the philosophy will land better after the run trace is in
  hand.
- **One ask per question.** Do not stack "what do you want / what scope /
  where on disk / which model" into one paragraph. Single question, wait,
  next question.
- **Persist the user's intent, briefly, in the scaffold.** When you write the
  user's first `*.prose.md`, keep YAML frontmatter as the first bytes of the
  file. Add a one-line `### Description` or an HTML comment immediately after
  the closing frontmatter delimiter naming the user's stated intent, so a
  future agent reading it knows what the contract was meant to do.
