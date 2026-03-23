---
name: vm-improver
kind: program
services: [analyst, researcher, implementer, pr-author]
---

requires:
- inspection-path: path to an inspection output file (e.g., bindings/inspection.md from a prior inspector run)
- prose-repo: path to the prose skill directory (e.g., prose/skills/open-prose)

ensures:
- result: PRs to the prose repo implementing VM improvements
- if no improvements needed: clean status with explanation of why the VM handled this run correctly

errors:
- no-inspection: the inspection-path does not exist or is not a valid inspection output
- no-improvements: inspection shows no VM-level issues (this is a success case, not a failure)
- repo-not-found: the prose-repo path does not exist or is not a valid prose skill directory

strategies:
- focus exclusively on VM-level issues: execution semantics, state tracking, contract enforcement, error handling, session management. Program-level issues belong to program-improver.
- when multiple VM issues are found: determine if they share a common root cause and propose a single coherent fix rather than many patches
- validate proposed changes against the existing spec to ensure they do not break other documented behavior
- prefer minimal, targeted spec changes over broad rewrites

invariants:
- every proposed change references the specific inspection finding and the specific section of prose.md or forme.md it modifies
- proposed changes do not contradict other sections of the spec that are not being modified
- PR descriptions include a test scenario that demonstrates the fix

---

## analyst

requires:
- inspection-path: path to inspection output

ensures:
- findings: VM-specific issues extracted from the inspection, each with: the inspection dimension and score, a description of the VM behavior that was incorrect or suboptimal, and the relevant spec section in prose.md or forme.md

errors:
- no-inspection: the inspection-path does not exist or is not valid
- no-improvements: no VM-level issues found in the inspection

strategies:
- parse the verdict JSON to identify VM-related dimensions (manifest compliance, state tracking, contract enforcement, error handling)
- filter out program-level issues -- only VM behavior problems belong here
- for each finding, identify the specific section of prose.md or forme.md that governs the relevant behavior

---

## researcher

requires:
- findings: VM-specific issues with spec references

ensures:
- proposals: for each finding, a proposed spec change including: the target file and section, the current text, the proposed new text, and the rationale for the change

strategies:
- read the relevant spec sections to understand the current semantics before proposing changes
- check for interactions between the proposed change and other spec sections
- prefer clarifications and additions over removals -- the spec should grow more precise, not shrink
- consider edge cases: will this change affect single-component programs? persistent agents? test execution?

---

## implementer

requires:
- proposals: proposed spec changes with rationale
- prose-repo: path to the prose skill directory

ensures:
- changes: the actual modified spec files with proposals applied, plus a diff summary

strategies:
- apply changes precisely as proposed, adjusting only for integration with surrounding text
- validate that modified files maintain consistent formatting and terminology
- if a proposal conflicts with existing text in an unexpected way, flag it rather than force-fitting

---

## pr-author

requires:
- changes: modified spec files with diff summary

ensures:
- result: PR(s) to the prose repo with clear titles, descriptions linking to inspection findings, and test scenarios demonstrating the fix

strategies:
- PR title format: "fix(vm): [brief description of the behavioral fix]"
- PR body: the inspection finding, the root cause in the spec, the change made, and a test scenario
- group related changes into a single PR; separate unrelated changes into separate PRs
