import type {
  Diagnostic,
  LocalArtifactSchemaStatus,
  SourceSpan,
  TypeExpressionIR,
} from "../types.js";

export interface TypeExpressionParseResult {
  expression: TypeExpressionIR;
  diagnostics: Diagnostic[];
}

export function parseTypeExpression(
  source: string,
  sourceSpan?: SourceSpan,
): TypeExpressionParseResult {
  const parser = new TypeParser(source);
  const expression = parser.parse();
  const diagnostics = parser.diagnostics.map((message) => ({
    severity: "warning" as const,
    code: "malformed_type_expression",
    message,
    source_span: sourceSpan,
  }));
  return { expression, diagnostics };
}

export function typeExpressionToJsonSchema(expression: TypeExpressionIR): unknown {
  if (expression.kind === "array" && expression.element) {
    return {
      type: "array",
      items: typeExpressionToJsonSchema(expression.element),
    };
  }

  if (expression.kind === "primitive") {
    return primitiveSchema(expression.name);
  }

  if (expression.kind === "generic") {
    const [first] = expression.args;
    if (expression.name === "Markdown") {
      return {
        type: "string",
        contentMediaType: "text/markdown",
        openprose: {
          type: expression.raw,
          format: "markdown",
          schema: first ? typeExpressionToJsonSchema(first) : null,
        },
      };
    }
    if (expression.name === "Json") {
      return {
        openprose: {
          type: expression.raw,
          format: "json",
        },
        ...(first && first.kind === "named"
          ? { $ref: `#/$defs/${first.name}` }
          : first
            ? (typeExpressionToJsonSchema(first) as Record<string, unknown>)
            : {}),
      };
    }
    if (expression.name === "run") {
      return {
        type: "object",
        required: ["run_id"],
        properties: {
          run_id: { type: "string" },
          component_ref: { type: "string" },
          type: first ? { const: first.raw } : { type: "string" },
        },
        openprose: {
          type: expression.raw,
          format: "run",
        },
      };
    }
  }

  return namedSchema(expression.name);
}

export function portSchemaProjection(options: {
  name: string;
  type: TypeExpressionIR;
  required: boolean;
}): unknown {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: options.name,
    required: options.required,
    schema: typeExpressionToJsonSchema(options.type),
  };
}

export function validateTextAgainstTypeExpression(
  expression: TypeExpressionIR,
  content: string,
): LocalArtifactSchemaStatus {
  const diagnostics: Diagnostic[] = [];
  const status = validateExpression(expression, content.trim(), diagnostics);
  return {
    status,
    schema_ref: schemaRefForExpression(expression),
    diagnostics,
  };
}

const PRIMITIVES = new Set(["string", "number", "integer", "boolean", "Any"]);

class TypeParser {
  readonly diagnostics: string[] = [];
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): TypeExpressionIR {
    this.skipWhitespace();
    const expression = this.parsePrimary();
    this.skipWhitespace();
    if (this.index < this.source.length) {
      this.diagnostics.push(`Unexpected type expression suffix '${this.source.slice(this.index)}'.`);
    }
    return expression;
  }

  private parsePrimary(): TypeExpressionIR {
    const start = this.index;
    const name = this.parseIdentifier();
    if (!name) {
      this.diagnostics.push(`Expected a type name in '${this.source}'.`);
      return namedExpression("Any", this.source || "Any");
    }

    let expression: TypeExpressionIR;
    this.skipWhitespace();
    if (this.peek() === "<") {
      this.index += 1;
      const args: TypeExpressionIR[] = [];
      while (this.index < this.source.length && this.peek() !== ">") {
        args.push(this.parsePrimary());
        this.skipWhitespace();
        if (this.peek() === ",") {
          this.index += 1;
          this.skipWhitespace();
        } else {
          break;
        }
      }
      if (this.peek() === ">") {
        this.index += 1;
      } else {
        this.diagnostics.push(`Generic type '${name}' is missing a closing '>'.`);
      }
      expression = {
        type_expr_version: "0.1",
        kind: "generic",
        raw: this.source.slice(start, this.index),
        name,
        args,
        element: null,
      };
    } else {
      expression = PRIMITIVES.has(name)
        ? primitiveExpression(name, this.source.slice(start, this.index))
        : namedExpression(name, this.source.slice(start, this.index));
    }

    this.skipWhitespace();
    while (this.source.slice(this.index, this.index + 2) === "[]") {
      this.index += 2;
      expression = {
        type_expr_version: "0.1",
        kind: "array",
        raw: this.source.slice(start, this.index),
        name: "Array",
        args: [expression],
        element: expression,
      };
      this.skipWhitespace();
    }

    return expression;
  }

  private parseIdentifier(): string | null {
    const match = this.source.slice(this.index).match(/^[A-Za-z][A-Za-z0-9_.\-/]*/);
    if (!match) {
      return null;
    }
    this.index += match[0].length;
    return match[0];
  }

  private peek(): string {
    return this.source[this.index] ?? "";
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) {
      this.index += 1;
    }
  }
}

function primitiveExpression(name: string, raw: string): TypeExpressionIR {
  return {
    type_expr_version: "0.1",
    kind: "primitive",
    raw,
    name,
    args: [],
    element: null,
  };
}

function namedExpression(name: string, raw: string): TypeExpressionIR {
  return {
    type_expr_version: "0.1",
    kind: "named",
    raw,
    name,
    args: [],
    element: null,
  };
}

function primitiveSchema(name: string): unknown {
  if (name === "Any") {
    return {};
  }
  return { type: name };
}

function namedSchema(name: string): unknown {
  return { $ref: `#/$defs/${name}` };
}

function validateExpression(
  expression: TypeExpressionIR,
  content: string,
  diagnostics: Diagnostic[],
): LocalArtifactSchemaStatus["status"] {
  if (expression.kind === "generic" && expression.name === "Markdown") {
    return "unchecked";
  }
  if (expression.kind === "named") {
    return "unchecked";
  }
  if (expression.kind === "array") {
    const parsed = parseJson(content, diagnostics, expression.raw);
    return parsed === undefined
      ? "invalid"
      : validateJsonValueAgainstExpression(expression, parsed, diagnostics, expression.raw);
  }
  if (expression.kind === "generic" && expression.name === "Json") {
    const parsed = parseJson(content, diagnostics, expression.raw);
    if (parsed === undefined) {
      return "invalid";
    }
    const [inner] = expression.args;
    return inner
      ? validateJsonValueAgainstExpression(inner, parsed, diagnostics, expression.raw)
      : "valid";
  }
  if (expression.kind === "generic" && expression.name === "run") {
    const parsed = parseJson(content, diagnostics, expression.raw);
    return parsed === undefined
      ? "invalid"
      : validateJsonValueAgainstExpression(expression, parsed, diagnostics, expression.raw);
  }
  if (expression.kind === "primitive") {
    if (expression.name === "Any") {
      return "unchecked";
    }
    if (expression.name === "string") {
      return "valid";
    }
    if (expression.name === "number" || expression.name === "integer") {
      const value = Number(content);
      const valid =
        content.length > 0 &&
        Number.isFinite(value) &&
        (expression.name === "number" || Number.isInteger(value));
      if (!valid) {
        diagnostics.push({
          severity: "error",
          code: "schema_number_expected",
          message: `Expected '${expression.raw}' to be ${expression.name}.`,
        });
      }
      return valid ? "valid" : "invalid";
    }
    if (expression.name === "boolean") {
      const valid = content === "true" || content === "false";
      if (!valid) {
        diagnostics.push({
          severity: "error",
          code: "schema_boolean_expected",
          message: `Expected '${expression.raw}' to be boolean.`,
        });
      }
      return valid ? "valid" : "invalid";
    }
  }
  return "unchecked";
}

function validateJsonValueAgainstExpression(
  expression: TypeExpressionIR,
  value: unknown,
  diagnostics: Diagnostic[],
  parentType: string,
): LocalArtifactSchemaStatus["status"] {
  if (expression.kind === "named" || expression.name === "Any") {
    return "valid";
  }

  if (expression.kind === "primitive") {
    if (expression.name === "string") {
      return validateJsonPredicate(
        typeof value === "string",
        diagnostics,
        parentType,
        "schema_string_expected",
        "string",
      );
    }
    if (expression.name === "number") {
      return validateJsonPredicate(
        typeof value === "number" && Number.isFinite(value),
        diagnostics,
        parentType,
        "schema_number_expected",
        "number",
      );
    }
    if (expression.name === "integer") {
      return validateJsonPredicate(
        typeof value === "number" && Number.isInteger(value),
        diagnostics,
        parentType,
        "schema_number_expected",
        "integer",
      );
    }
    if (expression.name === "boolean") {
      return validateJsonPredicate(
        typeof value === "boolean",
        diagnostics,
        parentType,
        "schema_boolean_expected",
        "boolean",
      );
    }
  }

  if (expression.kind === "array") {
    if (!Array.isArray(value)) {
      diagnostics.push({
        severity: "error",
        code: "schema_array_expected",
        message: `Expected '${parentType}' to be a JSON array.`,
      });
      return "invalid";
    }
    const element = expression.element;
    if (!element) {
      return "valid";
    }
    let valid = true;
    value.forEach((item, index) => {
      const before = diagnostics.length;
      const status = validateJsonValueAgainstExpression(
        element,
        item,
        diagnostics,
        `${parentType}[${index}]`,
      );
      valid = valid && status !== "invalid" && diagnostics.length === before;
    });
    return valid ? "valid" : "invalid";
  }

  if (expression.kind === "generic" && expression.name === "Json") {
    const [inner] = expression.args;
    return inner
      ? validateJsonValueAgainstExpression(inner, value, diagnostics, parentType)
      : "valid";
  }

  if (expression.kind === "generic" && expression.name === "run") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      diagnostics.push({
        severity: "error",
        code: "schema_run_ref_expected",
        message: `Expected '${parentType}' to be a JSON run reference object.`,
      });
      return "invalid";
    }
    const record = value as Record<string, unknown>;
    if (typeof record.run_id !== "string" || record.run_id.trim().length === 0) {
      diagnostics.push({
        severity: "error",
        code: "schema_run_ref_expected",
        message: `Expected '${parentType}' to include a string run_id.`,
      });
      return "invalid";
    }
    const expected = expression.args[0]?.raw;
    if (expected && typeof record.type === "string" && record.type !== expected) {
      diagnostics.push({
        severity: "error",
        code: "schema_run_ref_type_mismatch",
        message: `Expected '${parentType}' to reference run type '${expected}' but found '${record.type}'.`,
      });
      return "invalid";
    }
    return "valid";
  }

  if (expression.kind === "generic" && expression.name === "Markdown") {
    return validateJsonPredicate(
      typeof value === "string",
      diagnostics,
      parentType,
      "schema_string_expected",
      "markdown string",
    );
  }

  return "valid";
}

function validateJsonPredicate(
  valid: boolean,
  diagnostics: Diagnostic[],
  type: string,
  code: string,
  expected: string,
): LocalArtifactSchemaStatus["status"] {
  if (!valid) {
    diagnostics.push({
      severity: "error",
      code,
      message: `Expected '${type}' to be ${expected}.`,
    });
  }
  return valid ? "valid" : "invalid";
}

function parseJson(
  content: string,
  diagnostics: Diagnostic[],
  type: string,
): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "schema_json_parse_failed",
      message: `Expected '${type}' to contain valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return undefined;
  }
}

function schemaRefForExpression(expression: TypeExpressionIR): string | null {
  if (expression.kind === "named") {
    return `#/$defs/${expression.name}`;
  }
  if (expression.kind === "generic" && expression.args[0]?.kind === "named") {
    return `#/$defs/${expression.args[0].name}`;
  }
  return null;
}
