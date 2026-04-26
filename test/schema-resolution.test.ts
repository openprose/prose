import {
  compileFixture,
  describe,
  expect,
  test,
} from "./support";
import {
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

  test("validates run reference shape without pretending named schemas are resolved", () => {
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
      status: "valid",
      schema_ref: "#/$defs/CompanyProfile",
    });
  });
});
