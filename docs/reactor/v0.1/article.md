# When the Conversation Ends, the Responsibility Doesn't

#### Introducing Reactor — an AI harness whose cost scales with surprise, plus a bounded audit floor, not the clock

*By the OpenProse team.*

---

Sometime last quarter, you asked an AI assistant to keep an eye on something.

Maybe it was a customer who had gone quiet — *tell me if this account looks
like it's about to churn.* Maybe it was a release — *let me know when this is
actually ready to ship.* Maybe it was an incident channel you wanted
summarized while you slept. The assistant was good. It read what you gave it,
thought it over, and came back with something genuinely useful.

And then the conversation ended.

The window closed, the context evaporated, and the thing you actually wanted
— not the answer, the *watching* — quietly never happened. The customer
churned anyway. The release slipped. You found out on Monday. Not because the
AI wasn't smart enough. Because nobody had built the part where it *stays
responsible* for something after the chat is over.

That gap is the reason we built Reactor.

## A category line: tasks versus responsibilities

The last two years of AI agents have been a story about *tasks*. The tools
most of us now use every day — Claude Code, Codex, and the rest — are
genuinely, impressively good at them. Point one at a bug and it will find the
bug, write the fix, run the tests, and explain what it did. That is a real
achievement, and we are not here to talk anyone out of it.

But notice the shape of what they do. A task has an edge. It begins when you
ask and it ends when it's done. The agent is brilliant *inside* that edge and
simply gone outside it.

Most of what an organization actually needs from software is not shaped like
that. *The incident channel has a current briefing. Renewal risk is visible
before the meeting, not after. Our audit evidence is fresh enough to pass
review.* None of those is a task you finish. Each is a **responsibility** — a
claim about the world that has to stay true while the world keeps moving.

Today, you fake a responsibility one of two ways.

You can put the AI on a schedule — a cron job that re-asks the same question
every hour. It works, but it pays full price every single time, including the
twenty-three hours a day when nothing changed. Your bill scales with the
clock, not with reality — a quietly expensive habit, and, as the price of a
token stops falling, one that is getting expensive out loud.

Or you can set an alert — cheap, but blind. An alert only catches the things
you already knew to watch for. And the whole reason you wanted an
*intelligence* watching is that it might notice what you didn't think to
specify.

Both approaches fail in the same place: they have no idea whether anything
actually *happened*. Reactor is built around that missing idea.

## The idea, in plain terms

Reactor runs on a **contract** — a plain document, written in Markdown, that a
person writes and edits. The contract says, in ordinary language, what should
stay true: what the responsibility is, what counts as evidence, when to bring
in a human. That document is the single source of intent. Everything else the
system produces is derived from it — and if anything derived ever disagrees
with the contract, the contract wins.

Reactor does not wake up because you prompted it. It wakes up because the
world tripped a condition the contract cares about — a new event, a piece of
evidence that aged past a freshness line, an upstream fact that moved.

And here is the part that makes it different. When Reactor wakes, checks, and
finds the evidence is *the same as last time*, it does not think again. It
reuses its previous decision — at zero token cost — and records that it did
so. It spends real model work only when something genuinely changed. We have a
name for this: **cost scales with surprise — plus a bounded audit floor —
not the clock.** A world that sits still costs almost nothing to keep
watched. Real model spend appears when the world hands the system something
new — and, at one configurable far-apart interval, when Reactor forces a
deep re-check anyway, on the chance that *something it wasn't watching for*
quietly moved. That audit floor is a known, named, accounted-for line item,
not a hidden meter; it is what keeps "quiet" from sliding into "asleep."

The thinking itself — the judgment about whether the responsibility is still
being met — is the model's job. Reactor does not try to out-clever the model.
It wraps the model in deterministic code that does the un-clever, essential
things: it schedules the checks, enforces hard limits the model cannot talk
its way past, and writes everything down. The intelligence is the model's. The
determinism is there to *bound* it, never to replace it.

And every time Reactor acts, it leaves a **receipt** — a small, tamper-evident
record of what it looked at, what it decided, what it cost, and why. Not a
chat log you scroll through and hope. A receipt is *content-addressed*, which
is a precise way of saying: change one character of it after the fact and the
change is obvious. The receipt names the evidence it consulted by a content
fingerprint rather than copying the evidence body inside itself — so months
later, you can pick up a receipt and verify that the decision happened, what
it decided, and which evidence it consulted; the evidence itself you fetch
from wherever it lived. (A receipt that pins its own raw evidence is on the
roadmap; today the receipt is the proof-of-decision, and the evidence is one
named hop away.)

Because sometimes the right move *is* to stop. If the contract has become
impossible to judge honestly — the evidence isn't there, the situation is
genuinely ambiguous — Reactor does not guess. It writes a receipt that says
*blocked, and here is why*, and surfaces that to the person who owns the
responsibility. Under uncertainty it escalates or waits. It would rather be
quiet and honest than confident and wrong.

## Why this is a different bet

Here is the wager underneath all of it, and it is genuinely contrarian.

The whole industry is racing to make long-running AI cheaper — and almost
everyone is doing it the same way: by getting clever about *the conversation*.
Cache the context. Compact the history. Summarize the transcript so the next
turn is shorter. These are real techniques, and they work.

Reactor's bet is that the conversation is the wrong unit to optimize. If
nothing happened in the world, the cheapest conversation is not a shorter one
— it is *no conversation at all*. Don't compress the thinking; skip it, reuse
the last verdict, move on. Everyone else is making the meeting shorter. We are
asking why you are holding the meeting when there is nothing to discuss.

That bet used to be a quiet preference; it is becoming an urgent one. The
first wave of AI tooling was priced for a world where the cost of a token only
ever falls — and a great many always-on workflows were built on that
assumption. It is now being tested, hard. Reactor was built on the opposite
assumption: that one day you pay the real cost of running a model, and on that
day the only sane thing is to stop paying it for a world that is sitting still.

The receipt is the other half of the bet. A transcript can tell you what was
*said*. It cannot tell you, six months and ten thousand turns later, why one
specific decision was made — you would have to find the right moment in a
river of text and trust it was never edited. A receipt can. It is the
difference between *trust me, I'm an AI* and *here is the evidence, check it
yourself.* For anything you intend to let run unattended, that difference is
the whole game — and it is also the answer to the question every team running
AI is now learning to ask, *where did the money go?* Not a shrug. A stack of
receipts, each one naming the surprise it paid for.

## The commitments underneath

Reactor is young, but it stands on a small set of commitments we decided up
front we would not trade away. They are worth stating plainly, because they
are what the project *is*.

- **Intent lives in one place.** There is exactly one authored source of what
  a responsibility means — the Markdown contract. Not a prompt, not a buried
  config, not a fine-tuned model. One document a human can read and argue
  with.
- **The intelligence is the model's; the determinism only bounds it.** A
  model authors the judgment and the policy. Deterministic code never
  overrules that judgment — it validates, schedules, and records it, and
  holds it inside limits the model cannot move.
- **Continuity lives in the trail, not in a session.** Nothing important
  depends on a process that runs forever. Every run is bounded; the
  responsibility persists in a durable trail of receipts. The chat can end.
  The responsibility doesn't.
- **It fails safe.** Faced with real uncertainty, the system stops or
  escalates rather than acting — and it asks a human only when one is
  genuinely needed, so the ask is a signal, not noise.
- **Trust is demonstrated, not claimed.** Every decision leaves verifiable
  evidence. You do not take the system's word for anything; you check the
  receipt.
- **Nothing is held hostage.** A contract and its trail can move to any
  compliant host without losing their meaning. The runtime, the language, and
  the skill are MIT-licensed and free, forever. Portability is the discipline
  that keeps the whole thing honest.

## What you would use it for

What does this look like in practice? Reactor ships with a handful of worked
examples — each a small, runnable responsibility. Picture them.

**The incident channel that briefs itself.** An incident opens. Reactor keeps
a running, current briefing of what is known — and as the incident moves, the
briefing moves with it. When nothing new comes in, it goes quiet, for free.
The on-call engineer who joins at 3am reads one current paragraph instead of
scrolling four hours of chatter.

**The renewal radar.** A responsibility that watches a customer account and
tells you it looks shaky *before* the renewal meeting — not after the churn.
It re-checks when the signals move, not on a calendar, so it is both timely
and cheap.

**The compliance evidence that stays fresh.** Audit evidence goes stale
silently — that is how audits become fire drills. A Reactor responsibility
knows when a piece of evidence has aged past its freshness line, and surfaces
it, with a receipt, before the auditor is the one who notices.

**The release that tells you when it is ready.** Not a checklist a human
re-runs by hand. A responsibility that re-checks the release candidate itself
whenever something relevant changes, and produces a receipt that says — with
its reasons — *ready*, or *not yet*.

The shape is the same every time: a thing you wanted to *stay true*, watched
by an intelligence, paid for in proportion to how much the world actually
moved, with a paper trail you can audit afterward.

## What is real today — and what is next

A straight answer about what you can touch right now.

Reactor is **v0.1**, the first public release, and it is on npm with SLSA v1
provenance. The runtime, the receipts, the memory that reuses an unchanged
verdict for free, the predicate-driven loop, the deterministic evaluation
harness — those are real, built, tested, and runnable today. There is a demo that takes about two
minutes: install the package, run one example, and watch it account for a full
simulated day of a responsibility as **`46:46`** — 46 fresh tokens of model
work with memo versus 92 without, half the fresh spend, two model invocations
where a naive loop would have made four. It is a deterministic accounting proof, not a marketing
number: run it twice and the receipts come back identical, byte for byte.
Independent first-time evaluators have already reproduced it.

We are equally clear about what v0.1 is *not* yet. It is a local harness and a
measurement rig — not a hosted product. It does not yet authenticate or
validate production event sources. The cryptographic signer is a stub;
receipts today are honest local artifacts, not cross-organization
attestations. Multi-provider judging is recorded, not yet live. All of that is
real engineering still ahead of us — it is on the roadmap, in the open, and
described plainly in the technical report. None of it is hidden behind a
"coming soon."

What we are launching is the bet, the mechanism, and the proof that the
mechanism works. If you maintain something that has to stay true while the
world keeps moving, come find us: clone the repo, run the demo, read the
technical report for the evidence, and bring us the hardest responsibility you
have. The most useful thing you can send is not a compliment. It is a
responsibility Reactor *should* be able to keep — and cannot yet.

The conversation, eventually, always ends. The responsibility should not have
to.

---

*Reactor is open source. The runtime is [`@openprose/reactor`](https://www.npmjs.com/package/@openprose/reactor)
on npm; the source, the bundled examples, and the two-minute `46:46` demo are
at [github.com/openprose/prose](https://github.com/openprose/prose); the
[technical report](./report) walks through the
evidence and the limitations in full.*
