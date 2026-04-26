import {
  compileFixture,
  describe,
  expect,
  join,
  mkdirSync,
  mkdtempSync,
  readArtifactRecordForOutput,
  runSource,
  test,
  tmpdir,
  writeFileSync,
} from "./support";
import {
  loadPackageSchemaDefinitionsForPath,
  parseTypeExpression,
  portSchemaProjection,
  typeExpressionToJsonSchema,
  validateTextAgainstTypeExpression,
} from "../src/schema";

describe("OpenProse type expressions and schema projection", () => {
  test("parses primitive, generic, array, and run type expressions", () => {
    expect(parseTypeExpression("string").expression).toMatchObject({
      kind: "primitive",
      name: "string",
    });
    expect(parseTypeExpression("Markdown<ExecutiveBrief>").expression).toMatchObject({
      kind: "generic",
      name: "Markdown",
      args: [expect.objectContaining({ kind: "named", name: "ExecutiveBrief" })],
    });
    expect(parseTypeExpression("ClaimCheck[]").expression).toMatchObject({
      kind: "array",
      element: expect.objectContaining({ kind: "named", name: "ClaimCheck" }),
    });
    expect(parseTypeExpression("run<company-intake>").expression).toMatchObject({
      kind: "generic",
      name: "run",
      args: [expect.objectContaining({ name: "company-intake" })],
    });
  });

  test("projects known type expressions into JSON Schema compatible shapes", () => {
    const markdown = parseTypeExpression("Markdown<ExecutiveBrief>").expression;
    expect(typeExpressionToJsonSchema(markdown)).toMatchObject({
      type: "string",
      contentMediaType: "text/markdown",
      openprose: {
        format: "markdown",
      },
    });

    const runRef = parseTypeExpression("run<company-intake>").expression;
    expect(typeExpressionToJsonSchema(runRef)).toMatchObject({
      type: "object",
      required: ["run_id"],
      properties: {
        run_id: { type: "string" },
        type: { const: "company-intake" },
      },
      openprose: {
        format: "run",
      },
    });
  });

  test("adds parsed type IR to compiled ports", () => {
    const ir = compileFixture("typed-effects.prose.md");
    const subject = ir.components[0].ports.requires.find((port) => port.name === "subject");
    const brief = ir.components[0].ports.ensures.find((port) => port.name === "brief");

    expect(subject?.type_expr).toMatchObject({
      kind: "generic",
      name: "run",
      args: [expect.objectContaining({ name: "company-enrichment" })],
    });
    expect(brief?.type_expr).toMatchObject({
      kind: "generic",
      name: "Markdown",
      args: [expect.objectContaining({ name: "ExecutiveBrief" })],
    });
    expect(
      portSchemaProjection({
        name: brief?.name ?? "brief",
        type: brief!.type_expr,
        required: brief?.required ?? true,
      }),
    ).toMatchObject({
      title: "brief",
      schema: {
        type: "string",
        contentMediaType: "text/markdown",
      },
    });
  });

  test("validates enforceable JSON primitive and array shapes", () => {
    const number = parseTypeExpression("number").expression;
    expect(validateTextAgainstTypeExpression(number, "")).toMatchObject({
      status: "invalid",
      diagnostics: [expect.objectContaining({ code: "schema_number_expected" })],
    });

    const jsonNumber = parseTypeExpression("Json<number>").expression;
    expect(validateTextAgainstTypeExpression(jsonNumber, "42")).toMatchObject({
      status: "valid",
    });
    expect(validateTextAgainstTypeExpression(jsonNumber, '"forty-two"')).toMatchObject({
      status: "invalid",
      diagnostics: [expect.objectContaining({ code: "schema_number_expected" })],
    });

    const integers = parseTypeExpression("integer[]").expression;
    expect(validateTextAgainstTypeExpression(integers, "[1, 2, 3]")).toMatchObject({
      status: "valid",
    });
    expect(validateTextAgainstTypeExpression(integers, "[1, 2.5]")).toMatchObject({
      status: "invalid",
      diagnostics: [expect.objectContaining({ code: "schema_number_expected" })],
    });
  });

  test("validates run reference shape and marks unresolved named schemas as unchecked", () => {
    const runRef = parseTypeExpression("run<company-intake>").expression;

    expect(
      validateTextAgainstTypeExpression(
        runRef,
        '{"run_id":"run-1","type":"company-intake"}',
      ),
    ).toMatchObject({ status: "valid" });
    expect(
      validateTextAgainstTypeExpression(
        runRef,
        '{"run_id":"run-1","type":"other-component"}',
      ),
    ).toMatchObject({
      status: "invalid",
      diagnostics: [expect.objectContaining({ code: "schema_run_ref_type_mismatch" })],
    });

    const namedJson = parseTypeExpression("Json<CompanyProfile>").expression;
    expect(validateTextAgainstTypeExpression(namedJson, '{"name":"Acme"}')).toMatchObject({
      status: "unchecked",
      schema_ref: "#/$defs/CompanyProfile",
      diagnostics: [expect.objectContaining({ code: "schema_definition_unresolved" })],
    });
  });

  test("validates named Json<T> when definitions are supplied", () => {
    const namedJson = parseTypeExpression("Json<CompanyProfile>").expression;
    const definitions = {
      CompanyProfile: {
        type: "object",
        required: ["name", "employee_count"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          employee_count: { type: "integer" },
          segment: { enum: ["startup", "enterprise"] },
        },
      },
    };

    expect(
      validateTextAgainstTypeExpression(
        namedJson,
        '{"name":"Acme","employee_count":42,"segment":"startup"}',
        { definitions },
      ),
    ).toMatchObject({ status: "valid" });
    expect(
      validateTextAgainstTypeExpression(
        namedJson,
        '{"name":"Acme","segment":"other"}',
        { definitions },
      ),
    ).toMatchObject({
      status: "invalid",
      diagnostics: [
        expect.objectContaining({ code: "schema_required_property_missing" }),
        expect.objectContaining({ code: "schema_enum_mismatch" }),
      ],
    });
  });

  test("loads package-local $defs for runtime input and output validation", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-schema-package-"));
    mkdirSync(join(root, "schemas"), { recursive: true });
    writeFileSync(
      join(root, "prose.package.json"),
      JSON.stringify({
        name: "@test/schema-package",
        version: "0.1.0",
        schemas: ["schemas/types.schema.json"],
      }, null, 2),
    );
    writeFileSync(
      join(root, "schemas/types.schema.json"),
      JSON.stringify({
        $defs: {
          LeadProfile: {
            type: "object",
            required: ["name", "employee_count"],
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              employee_count: { type: "integer" },
            },
          },
        },
      }, null, 2),
    );
    const sourcePath = join(root, "profile-normalizer.prose.md");
    const source = `---
name: profile-normalizer
kind: service
---

### Requires

- \`profile\`: Json<LeadProfile> - account profile

### Ensures

- \`normalized_profile\`: Json<LeadProfile> - normalized profile

### Effects

- \`pure\`: deterministic normalization
`;
    writeFileSync(sourcePath, source);

    const loaded = await loadPackageSchemaDefinitionsForPath(sourcePath);
    expect(Object.keys(loaded.definitions)).toContain("LeadProfile");

    const blockedInput = await runSource(source, {
      path: sourcePath,
      runId: "schema-input",
      runRoot: join(root, ".prose/runs"),
      inputs: {
        profile: '{"name":"Acme"}',
      },
      outputs: {
        normalized_profile: '{"name":"Acme","employee_count":42}',
      },
    });
    expect(blockedInput.record.status).toBe("blocked");
    expect(blockedInput.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain(
      "required property 'employee_count'",
    );

    const invalidOutput = await runSource(source, {
      path: sourcePath,
      runId: "schema-output",
      runRoot: join(root, ".prose/runs"),
      inputs: {
        profile: '{"name":"Acme","employee_count":42}',
      },
      outputs: {
        normalized_profile: '{"name":"Acme"}',
      },
    });
    expect(invalidOutput.record.status).toBe("failed");
    expect(invalidOutput.record.acceptance.reason).toContain(
      "required property 'employee_count'",
    );
    const invalidArtifact = await readArtifactRecordForOutput(
      join(root, ".prose/store"),
      invalidOutput.record.run_id,
      "profile-normalizer",
      "normalized_profile",
    );
    expect(invalidArtifact?.schema).toMatchObject({
      status: "invalid",
      diagnostics: [
        expect.objectContaining({ code: "schema_required_property_missing" }),
      ],
    });
  });
});
