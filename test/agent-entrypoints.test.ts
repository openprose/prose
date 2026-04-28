import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./support";

const repoRoot = join(import.meta.dir, "..");

describe("agent-facing entrypoints", () => {
  test("unreleased changelog describes the runtime model", () => {
    const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");
    const unreleased = changelog.split("## [0.10.0]")[0] ?? changelog;

    expect(unreleased).toContain("Pi graph VM");
    expect(unreleased).toContain("prose handoff");
  });

  test("skill and command sidecars route agents to CLI boundaries", () => {
    const skillsReadme = readFileSync(join(repoRoot, "skills/README.md"), "utf8");
    const commandsReadme = readFileSync(join(repoRoot, "commands/README.md"), "utf8");
    const handoffCommandPath = join(repoRoot, "commands/prose-handoff.md");
    const handoffCommand = readFileSync(handoffCommandPath, "utf8");
    const preflightCommand = readFileSync(join(repoRoot, "commands/prose-preflight.md"), "utf8");

    expect(skillsReadme).toContain("OpenProse skill router");
    expect(skillsReadme).toContain("Pi graph-VM execution");
    expect(skillsReadme).not.toContain("canonical definition of what the OpenProse VM is");
    expect(commandsReadme).toContain("prose-handoff.md");
    expect(existsSync(handoffCommandPath)).toBe(true);
    expect(handoffCommand).toContain("bun run prose handoff");
    expect(handoffCommand).toContain("Multi-node");
    expect(preflightCommand).toContain("### Environment");
    expect(preflightCommand).not.toContain(".env files");
  });
});
