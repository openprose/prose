---
name: openprose-feedback-classifier
kind: function
version: 0.16.0
---

# Openprose Feedback Classifier

Separate project-local design issues from candidate improvements to OpenProse.

### Parameters

- `candidate`: proposed architecture
- `current`: prior architecture
- `request`: current user direction
- `landscape`: local facts
- `subjects`: optional evidence
- `authority_scope`: caller authority
- `framework_maturity`: current framework maturity

### Returns

- `openprose_feedback`: candidate records matching the top-level schema

### Strategies

- First ask whether a clearer Contract or different standard-library
  composition solves the pressure without a framework change.
- Attribute each remaining pressure to exactly one primary layer. Record other
  layers only as alternatives or follow-ups.
- A single project example is `possibly-general`, not `repeated`.
- Explicit direction from `openprose-maintainer` may be
  `maintainer-direction`, even before run evidence exists.
- Broad semantic changes are acceptable candidates in `experimental` mode;
  name the experiment that could validate or falsify them.
- Never create a patch, branch, issue, or PR from this classification stage.
  Issue publication is a separate, auditable operation after classification.

---

## openprose-feedback-publisher

Move classified framework pressure across the project boundary without changing
the installed OpenProse package.

### Parameters

- `feedback`: classified OpenProse feedback candidates
- `authority_scope`: caller authority
- `landscape`: canonical public repository, existing local feedback records,
  and available issue-publishing capability

### Returns

- `openprose_feedback`: candidates annotated with publication status and issue
  URL when available
- `feedback_publication`: issues found, issues filed, issue drafts, failures,
  and deduplication rationale

### Invariants

- Never implement framework feedback during Compose.
- Never edit the installed language, standard library, interpreter guidance,
  compiler, adapter, or harness in response to feedback from the current design
  session.
- Search open and closed public issues before filing. Prefer adding evidence to
  an existing issue over creating a duplicate.
- Each issue separates observation and evidence from the candidate solution;
  Compose discoveries are requests for later work, not foregone conclusions.
- Issue publication is the only permitted outward framework mutation. Never
  create a patch, branch, commit, or pull request.

### Strategies

- With `openprose-maintainer` authority and issue capability available, file or
  deduplicate the issue after classification.
- Without maintainer authority or issue capability, return a complete issue
  draft and preserve it in `architecture/openprose-feedback.md`.
- Use a concise problem-oriented title. Include affected layer, evidence,
  smallest plausible change, alternatives, compatibility pressure, and links
  to any originating architecture decision that is safe to publish.
- Do not publish project secrets, private paths, raw transcripts, or proprietary
  program details. Reduce evidence to the smallest public reproduction.
