# OpenProse Tenets

###### Load-bearing principles that constrain every architectural decision. Read alongside [01-Language.md](./01-Language.md), [02-ReactorHarness.md](./02-ReactorHarness.md), and [03-ReactorPattern.md](./03-ReactorPattern.md).

These are the commitments that make OpenProse what it is. They are not feature
requirements; they are constraints that shape every downstream decision,
evaluated before any new capability is considered.

When the system is in tension with a tenet, the tenet wins. When two tenets
collide, the lower-numbered tenet wins — the order below is descending
precedence. That ordering — correctness over safety over cost, with minimizing
how often a human is interrupted a downstream goal rather than an authority the
other tenets bend around — is enforced where decisions are actually made: at
compile time, where the canonicalizer and postcondition validators are frozen,
and in the fail-safe commit gate, where a render that cannot satisfy its
obligations commits nothing rather than acting. It is not a separate runtime
policy dial.

---

## 1. Intent lives only in the contract.

The `*.prose.md` is the single authored source of meaning. Everything else —
compiled artifacts, projections, operational policy — is *derived* and
reconcilable; when a derived artifact disagrees with the contract, the contract
is right. There is no second authored surface for intent: not a prompt, a
config, or a tuned judge.

## 2. Intelligence is the model's; determinism only bounds it.

The model acts as a bounded *agent* — with an environment, a filesystem, and
the ability to read, write, and run code — that dynamically explores rather
than consuming a one-shot context. Intelligence lives in exactly two layers it
authors: the compilation (the canonicalizer and the postcondition validators,
frozen once per contract) and the render (the bounded session that computes the
next world-model). Deterministic code validates, schedules, records, and
executes what the agent authored, and constrains it with limits the agent
cannot override — it never decides meaning itself.

## 3. Continuity lives in the trail, not a session.

Every unit of work is bounded; nothing depends on a process that runs forever.
Standing intent is the program and persists across bounded runs in durable
state — a one-shot run is its degenerate case.

## 4. Fail safe.

Under uncertainty the system escalates or stops rather than acts, and asks a
human only when one is genuinely needed. Safety outranks cost; cost outranks
silence.

## 5. Trust is demonstrated, not claimed.

Every decision leaves verifiable evidence; that evidence is at once the audit
record, the composition edge, and the exit ticket. Consumers verify it
independently rather than trusting the producer.

## 6. Nothing is held hostage.

A contract and its trail can leave for any compliant host with no lost meaning.
Portability is the discipline that keeps every host honest.

## 7. One bounded run, one session; the DAG composes.

An activation is one bounded session in one runtime. What looks like
orchestration inside it — wiring, delegation, sub-task isolation, choreography
— is the agent honoring the contract with the runtime's own primitives. The
only seam where multiple runs meet is the world-model DAG, where activations
communicate through durable artifacts anchored by signed receipts. There is no
third tier.

---

*Governance — not a numbered tenet: the OpenProse language, runtime, and skill
are MIT-licensed and free, forever. Commerce is out of scope of this
specification and nothing in it depends on it.*
