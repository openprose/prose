// Unit test for scripts/mint-contract-id.mjs, the tool contract-markdown.md
// names for minting and repairing `id:` frontmatter.
//
// RUN: npx vitest run tests/open-prose/contract-markdown
import { describe, expect, it } from "vitest";
import { ensureId } from "../../../scripts/mint-contract-id.mjs";

const ID_LINE = /^id: [0-9A-HJKMNP-TV-Z]{26}$/;

describe("mint-contract-id --add", () => {
  it("inserts the id on its own line when kind: is the last frontmatter line", () => {
    const source = "---\nname: watcher\nkind: responsibility\n---\n\n# Watcher\n";
    const { status, source: out } = ensureId(source, { add: true });
    expect(status).toBe("minted");
    const lines = out.split("\n");
    expect(lines.slice(0, 3)).toEqual(["---", "name: watcher", "kind: responsibility"]);
    expect(lines[3]).toMatch(ID_LINE);
    expect(lines.slice(4)).toEqual(["---", "", "# Watcher", ""]);
  });

  it("inserts the id after version: when there is one", () => {
    const source = "---\nname: hook\nkind: gateway\nversion: 1.0.0\n---\n";
    const { status, source: out } = ensureId(source, { add: true });
    expect(status).toBe("minted");
    const lines = out.split("\n");
    expect(lines.slice(0, 4)).toEqual(["---", "name: hook", "kind: gateway", "version: 1.0.0"]);
    expect(lines[4]).toMatch(ID_LINE);
    expect(lines.slice(5)).toEqual(["---", ""]);
  });
});
