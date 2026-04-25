import type { Diagnostic, SourceSpan, TypeExpressionIR } from "../types.js";

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
