import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compileSource,
  describe,
  expect,
  preflightPath,
  renderPreflightText,
  test,
} from "./support";

const examplePath = join(
  import.meta.dir,
  "..",
  "examples",
  "north-star",
  "quarterly-investor-update.prose.md",
);
const skillSearchPath = join(
  import.meta.dir,
  "..",
  "examples",
  "skills",
);

describe("quarterly-investor-update north-star example", () => {
  test("compiles into a program with three sub-services and pins skill canonical names", () => {
    const ir = compileSource(readFileSync(examplePath, "utf8"), {
      path: examplePath,
    });

    const names = ir.components.map((component) => component.name).sort();
    expect(names).toEqual([
      "historical-letter-extractor",
      "investor-brief-synthesizer",
      "investor-letter-formatter",
      "quarterly-investor-update",
    ]);

    const program = ir.components.find(
      (component) => component.name === "quarterly-investor-update",
    );
    expect(program).toBeDefined();
    expect(program!.kind).toBe("program");
    expect(program!.services.map((service) => service.name)).toEqual([
      "historical-letter-extractor",
      "investor-brief-synthesizer",
      "investor-letter-formatter",
    ]);

    // System-level skill is declared on the program component itself.
    expect(program!.skills.map((skill) => skill.declared_name)).toEqual([
      "document-skills:pdf",
    ]);

    // Service-level skill is additive: the formatter declares its own
    // `document-skills:docx`, separate from the system-level scope.
    const formatter = ir.components.find(
      (component) => component.name === "investor-letter-formatter",
    );
    expect(formatter?.skills.map((skill) => skill.declared_name)).toEqual([
      "document-skills:docx",
    ]);
  });

  test("preflight passes against fixture skill stubs and surfaces both scopes", async () => {
    const result = await preflightPath(examplePath, {
      skillSearchPaths: [skillSearchPath],
    });

    expect(result.status).toBe("pass");
    expect(
      result.diagnostics.find((diagnostic) => diagnostic.code === "skill_unresolved"),
    ).toBeUndefined();

    // Both declarations land in the rendered Skills section: the system-level
    // pdf skill on the program, and the service-level docx skill on the
    // formatter.
    const declared = result.skills.map((skill) => ({
      name: skill.canonical_name,
      scope: skill.service ?? skill.component,
      resolution: skill.resolution,
    }));
    expect(declared).toContainEqual({
      name: "document-skills:pdf",
      scope: "quarterly-investor-update",
      resolution: "exact",
    });
    expect(declared).toContainEqual({
      name: "document-skills:docx",
      scope: "investor-letter-formatter",
      resolution: "exact",
    });

    const text = renderPreflightText(result);
    expect(text).toContain("Preflight: PASS");
    expect(text).toContain("Skills:");
    expect(text).toContain(
      "document-skills:pdf  (exact, on quarterly-investor-update)",
    );
    expect(text).toContain(
      "document-skills:docx  (exact, on investor-letter-formatter)",
    );
  });

  test("preflight fails closed when the fixture skills are not on the search path", async () => {
    const emptyDir = join(import.meta.dir, "fixtures", "skills", "empty");
    const result = await preflightPath(examplePath, {
      skillSearchPaths: [emptyDir],
    });

    expect(result.status).toBe("fail");
    const unresolved = result.diagnostics.filter(
      (diagnostic) => diagnostic.code === "skill_unresolved",
    );
    const messages = unresolved.map((diagnostic) => diagnostic.message).join("\n");
    expect(messages).toContain("document-skills:pdf");
    expect(messages).toContain("document-skills:docx");
  });
});
