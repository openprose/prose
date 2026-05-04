import { describe, expect, test } from "./support";
import { handoffSource, renderSingleRunHandoffMarkdown } from "../src/handoff";

const PROGRAM_WITH_SKILL = [
  "---",
  "name: extract-letter-summary",
  "kind: program",
  "skills:",
  "  - document-skills:pdf",
  "---",
  "",
  "### Description",
  "",
  "Extract the contents of a quarterly investor letter PDF and produce a tight",
  "three-bullet summary.",
  "",
  "### Requires",
  "",
  "- `letter_path`: filesystem path to a single quarterly investor letter PDF",
  "",
  "### Ensures",
  "",
  "- `summary`: a markdown bullet list",
  "",
].join("\n");

const PROGRAM_WITHOUT_SKILL = [
  "---",
  "name: simple-greeting",
  "kind: program",
  "---",
  "",
  "### Description",
  "",
  "Generate a polite greeting.",
  "",
  "### Requires",
  "",
  "- `name`: who to greet",
  "",
  "### Ensures",
  "",
  "- `greeting`: a Markdown line",
  "",
].join("\n");

describe("handoff carries skill activation contract", () => {
  test("handoff component.skills includes the declared canonical name", () => {
    const handoff = handoffSource(PROGRAM_WITH_SKILL, {
      path: "x.prose.md",
    });
    // The handoff schema must surface the skills the receiving harness MUST
    // activate before doing the work — same canonical names as the source.
    expect(handoff.component.skills).toEqual([
      { declared_name: "document-skills:pdf", canonical_name: "document-skills:pdf" },
    ]);
  });

  test("rendered markdown directs the harness to invoke open-prose then each declared skill", () => {
    const handoff = handoffSource(PROGRAM_WITH_SKILL, {
      path: "x.prose.md",
    });
    const md = renderSingleRunHandoffMarkdown(handoff);
    // A "## Required Skills" section must exist whenever skills are declared.
    expect(md).toContain("## Required Skills");
    // It must explicitly tell the receiving harness to activate the open-prose
    // skill BEFORE doing the program's work.
    expect(md).toMatch(/Skill\(['"]open-prose-raw:open-prose['"]\)/);
    // It must list each declared skill by canonical name in an activation
    // directive (not just as a bare bullet).
    expect(md).toMatch(/Skill\(['"]document-skills:pdf['"]\)/);
    // It must explicitly forbid silent fallback to built-in tools — the whole
    // point of the contract is that built-ins are NOT a substitute.
    expect(md.toLowerCase()).toContain("do not fall back");
  });

  test("rendered markdown omits the section entirely when no skills are declared", () => {
    const handoff = handoffSource(PROGRAM_WITHOUT_SKILL, {
      path: "y.prose.md",
    });
    const md = renderSingleRunHandoffMarkdown(handoff);
    // No noise for programs that don't declare skills.
    expect(md).not.toContain("## Required Skills");
    expect(md).not.toMatch(/Skill\(['"]/);
  });
});
