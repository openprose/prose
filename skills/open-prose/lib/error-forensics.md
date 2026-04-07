---
name: error-forensics
kind: program
services: [investigator, classifier, fixer]
---

requires:
- subject: run
- focus: focus area -- "vm" (VM-level issues), "program" (program logic issues), "context" (context window issues), or "external" (tool/API failures). Optional, default: auto-detect from error evidence.

ensures:
- report: forensic analysis containing a timeline of events leading to failure, identified root cause with confidence level, causal chain from trigger to failure, and prioritized fix recommendations (immediate workaround, permanent fix, prevention strategy)

errors:
- not-a-failure: the specified run completed successfully with no errors or anomalies
- corrupted-run: run directory is missing critical files (state.md, manifest.md) needed for analysis

strategies:
- when focus is auto-detect: examine state.md markers, __error.md files, and session logs to determine the failure domain before deep analysis
- when multiple potential root causes exist: rank by evidence strength and present the top candidate with alternatives noted
- when the failure cascaded across services: trace backward from the final error to find the originating service

invariants:
- the timeline includes timestamps and references to specific files in the run directory
- every root cause claim cites specific evidence from the run artifacts
- fix recommendations are specific enough to act on (not generic advice)

---

## investigator

requires:
- subject: run
- focus: focus area for investigation

ensures:
- evidence: chronological timeline of events from state.md, contents of any __error.md files, relevant session log excerpts, and anomalies detected in the execution trace

errors:
- corrupted-run: run directory is missing critical files needed for analysis

strategies:
- read state.md first to establish the execution timeline and identify where failure occurred
- check workspace/ directories for __error.md files
- examine manifest.md to understand expected vs actual execution flow
- look for partial outputs in workspace/ that indicate how far a service got before failing

---

## classifier

requires:
- evidence: collected evidence from the investigation

ensures:
- diagnosis: root cause classification (vm-bug, program-bug, context-overflow, contract-violation, tool-failure, external-api-error, or ambiguous), confidence level (high/medium/low), causal chain from trigger event to observed failure, and contributing factors

strategies:
- distinguish between proximate cause (what directly failed) and root cause (why it failed)
- check for common patterns: context window exhaustion shows as degraded output quality; contract violations show as missing or malformed ensures outputs; VM bugs show as incorrect state.md markers
- when confidence is low: list the top 2-3 hypotheses with evidence for and against each

---

## fixer

requires:
- diagnosis: root cause classification with causal chain

ensures:
- report: complete forensic report with timeline, root cause analysis, causal chain diagram, and three tiers of recommendations: immediate (workaround to unblock), permanent (fix the root cause), prevention (avoid recurrence)

strategies:
- tailor recommendations to the failure domain: VM bugs get spec change proposals, program bugs get contract amendments, context issues get service decomposition suggestions
- include specific file paths and line references where fixes should be applied
- if the root cause is ambiguous: recommend diagnostic steps to narrow it down before attempting fixes
