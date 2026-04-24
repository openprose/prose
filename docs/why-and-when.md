# Why and When to Use OpenProse

OpenProse is for workflows where a plain prompt is too loose, but a full custom orchestration codebase is too heavy.

## Use OpenProse When

Use it when you want an agent workflow to be:

- reusable instead of one-off
- inspectable instead of hidden in prompts
- typed enough to compose safely
- traceable enough to debug later
- selective enough to avoid re-running the whole graph
- packaged enough to install, search, benchmark, and serve

The sweet spot is a workflow with real structure:

- more than one role or step
- explicit inputs and outputs
- external reads or side effects that need to be declared
- approvals or policy boundaries
- a desire to turn today’s successful prompt into tomorrow’s stable component

## Why It Beats Baseline Agent Packages Here

Many AI packages help you *call* models or *coordinate* agents. OpenProse is trying to help you **engineer agent programs**.

That means the source artifact itself carries:

- the contract
- the graph shape
- the effect model
- the access model
- the package identity
- the run materialization model

That gives you some concrete advantages:

### 1. The source is reviewable

A `.prose.md` file is close to the problem domain. People can read the contract, the required inputs, the promised outputs, and the effects without digging through a framework-specific code path.

### 2. Composition becomes safer

Typed ports and declared effects make it much easier to connect programs without the usual "hope these prompts line up" behavior.

### 3. Planning becomes visible

Instead of a text wall of commands, we can compile to IR, render graphs, inspect stale reasons, and explain exactly what would re-run and why.

### 4. Reactivity becomes tractable

Because every execution is a run and every plan compares current state against prior materializations, OpenProse can support selective recompute instead of blindly replaying the whole workflow.

### 5. Sharing becomes cleaner

Packages can be installed by registry ref, quality-checked locally, searched by types and effects, and eventually served in a hosted registry without inventing a separate metadata system.

## When Not to Use It

Do not use OpenProse for:

- one-shot questions
- tiny tasks you would finish in one reply
- highly interactive back-and-forth editing where contract boundaries add friction
- prototypes where you still do not know the shape of the workflow

OpenProse is a good fit once a workflow starts to look like software.

## What OpenProse Is Especially Good At

Right now it is particularly strong for:

- multi-step content and research pipelines
- approval-gated delivery flows
- company-operating-system workflows
- packageable agent services that need install/search/publish discipline
- workflows that benefit from re-running only the affected downstream slice
- teams that want repo-native review, provenance, and reuse

## The Practical Test

Ask these questions:

1. Will we want to run this more than once?
2. Would we benefit from named inputs and outputs?
3. Will debugging provenance matter?
4. Could parts of this be reused elsewhere?
5. Are there effects, approvals, or policy boundaries we need to see?

If the answer is "yes" to several of those, OpenProse is usually the right level of structure.
