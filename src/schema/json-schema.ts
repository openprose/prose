import type {
  Diagnostic,
  LocalArtifactSchemaStatus,
} from "../types.js";
import type { SchemaDefinitionMap } from "./types.js";

interface SchemaValidationContext {
  parentType: string;
  path: string;
  definitions: SchemaDefinitionMap;
  seenRefs: Set<string>;
}

export function validateJsonValueAgainstSchema(
  schema: unknown,
  value: unknown,
  diagnostics: Diagnostic[],
  options: {
    parentType: string;
    definitions: SchemaDefinitionMap;
  },
): LocalArtifactSchemaStatus["status"] {
  return validateSchemaValue(schema, value, diagnostics, {
    parentType: options.parentType,
    path: "$",
    definitions: options.definitions,
    seenRefs: new Set(),
  });
}

function validateSchemaValue(
  schema: unknown,
  value: unknown,
  diagnostics: Diagnostic[],
  ctx: SchemaValidationContext,
): LocalArtifactSchemaStatus["status"] {
  if (!isRecord(schema)) {
    diagnostics.push({
      severity: "warning",
      code: "schema_definition_unsupported",
      message: `Named schema for '${ctx.parentType}' is not a JSON object and could not be structurally checked.`,
    });
    return "unchecked";
  }

  const ref = typeof schema.$ref === "string" ? schema.$ref : null;
  if (ref) {
    return validateSchemaRef(ref, value, diagnostics, ctx);
  }

  let status: LocalArtifactSchemaStatus["status"] = "valid";

  if ("const" in schema && !jsonEqual(value, schema.const)) {
    diagnostics.push({
      severity: "error",
      code: "schema_const_mismatch",
      message: `Expected '${ctx.parentType}' at ${ctx.path} to equal the declared constant.`,
    });
    status = "invalid";
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => jsonEqual(value, entry))) {
    diagnostics.push({
      severity: "error",
      code: "schema_enum_mismatch",
      message: `Expected '${ctx.parentType}' at ${ctx.path} to match one of the declared enum values.`,
    });
    status = "invalid";
  }

  const types = schemaTypes(schema);
  if (types.length > 0 && !types.some((type) => valueMatchesSchemaType(value, type))) {
    diagnostics.push({
      severity: "error",
      code: schemaTypeErrorCode(types),
      message: `Expected '${ctx.parentType}' at ${ctx.path} to be ${types.join(" or ")}.`,
    });
    return "invalid";
  }

  const objectLike =
    types.includes("object") ||
    isRecord(schema.properties) ||
    Array.isArray(schema.required);
  if (objectLike) {
    if (!isRecord(value)) {
      diagnostics.push({
        severity: "error",
        code: "schema_object_expected",
        message: `Expected '${ctx.parentType}' at ${ctx.path} to be object.`,
      });
      return "invalid";
    }
    status = combineStatus(status, validateObjectSchema(schema, value, diagnostics, ctx));
  }

  const arrayLike = types.includes("array") || isRecord(schema.items);
  if (arrayLike) {
    if (!Array.isArray(value)) {
      diagnostics.push({
        severity: "error",
        code: "schema_array_expected",
        message: `Expected '${ctx.parentType}' at ${ctx.path} to be array.`,
      });
      return "invalid";
    }
    status = combineStatus(status, validateArraySchema(schema, value, diagnostics, ctx));
  }

  return status;
}

function validateSchemaRef(
  ref: string,
  value: unknown,
  diagnostics: Diagnostic[],
  ctx: SchemaValidationContext,
): LocalArtifactSchemaStatus["status"] {
  const name = schemaNameFromRef(ref);
  if (!name) {
    diagnostics.push({
      severity: "warning",
      code: "schema_ref_unsupported",
      message: `Schema reference '${ref}' is outside the supported package-local $defs subset.`,
    });
    return "unchecked";
  }
  if (ctx.seenRefs.has(name)) {
    diagnostics.push({
      severity: "warning",
      code: "schema_ref_cycle",
      message: `Schema reference '${ref}' was skipped because it forms a cycle.`,
    });
    return "unchecked";
  }
  const target = ctx.definitions[name];
  if (!target) {
    diagnostics.push({
      severity: "warning",
      code: "schema_definition_unresolved",
      message: `Schema reference '${ref}' could not be resolved from package-local definitions.`,
    });
    return "unchecked";
  }
  const nextRefs = new Set(ctx.seenRefs);
  nextRefs.add(name);
  return validateSchemaValue(target, value, diagnostics, {
    ...ctx,
    seenRefs: nextRefs,
  });
}

function validateObjectSchema(
  schema: Record<string, unknown>,
  value: Record<string, unknown>,
  diagnostics: Diagnostic[],
  ctx: SchemaValidationContext,
): LocalArtifactSchemaStatus["status"] {
  let status: LocalArtifactSchemaStatus["status"] = "valid";
  const required = Array.isArray(schema.required)
    ? schema.required.filter((entry): entry is string => typeof entry === "string")
    : [];
  for (const key of required) {
    if (!(key in value)) {
      diagnostics.push({
        severity: "error",
        code: "schema_required_property_missing",
        message: `Expected '${ctx.parentType}' at ${ctx.path} to include required property '${key}'.`,
      });
      status = "invalid";
    }
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in value)) {
      continue;
    }
    status = combineStatus(
      status,
      validateSchemaValue(propertySchema, value[key], diagnostics, {
        ...ctx,
        path: `${ctx.path}.${key}`,
      }),
    );
  }

  if (schema.additionalProperties === false) {
    const allowed = new Set(Object.keys(properties));
    for (const key of Object.keys(value)) {
      if (allowed.has(key)) {
        continue;
      }
      diagnostics.push({
        severity: "error",
        code: "schema_additional_property",
        message: `Expected '${ctx.parentType}' at ${ctx.path} not to include undeclared property '${key}'.`,
      });
      status = "invalid";
    }
  }

  return status;
}

function validateArraySchema(
  schema: Record<string, unknown>,
  value: unknown[],
  diagnostics: Diagnostic[],
  ctx: SchemaValidationContext,
): LocalArtifactSchemaStatus["status"] {
  if (!isRecord(schema.items)) {
    return "valid";
  }
  let status: LocalArtifactSchemaStatus["status"] = "valid";
  value.forEach((item, index) => {
    status = combineStatus(
      status,
      validateSchemaValue(schema.items, item, diagnostics, {
        ...ctx,
        path: `${ctx.path}[${index}]`,
      }),
    );
  });
  return status;
}

function schemaTypes(schema: Record<string, unknown>): string[] {
  if (typeof schema.type === "string") {
    return [schema.type];
  }
  if (Array.isArray(schema.type)) {
    return schema.type.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function valueMatchesSchemaType(value: unknown, type: string): boolean {
  if (type === "object") {
    return isRecord(value);
  }
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "string") {
    return typeof value === "string";
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (type === "integer") {
    return typeof value === "number" && Number.isInteger(value);
  }
  if (type === "boolean") {
    return typeof value === "boolean";
  }
  if (type === "null") {
    return value === null;
  }
  return true;
}

function schemaTypeErrorCode(types: string[]): string {
  if (types.includes("object")) {
    return "schema_object_expected";
  }
  if (types.includes("array")) {
    return "schema_array_expected";
  }
  if (types.includes("string")) {
    return "schema_string_expected";
  }
  if (types.includes("number") || types.includes("integer")) {
    return "schema_number_expected";
  }
  if (types.includes("boolean")) {
    return "schema_boolean_expected";
  }
  return "schema_type_mismatch";
}

function schemaNameFromRef(ref: string): string | null {
  const defsMatch = ref.match(/^#\/(?:\$defs|definitions)\/([^/]+)$/);
  return defsMatch?.[1] ?? null;
}

function combineStatus(
  current: LocalArtifactSchemaStatus["status"],
  next: LocalArtifactSchemaStatus["status"],
): LocalArtifactSchemaStatus["status"] {
  if (current === "invalid" || next === "invalid") {
    return "invalid";
  }
  if (current === "unchecked" || next === "unchecked") {
    return "unchecked";
  }
  return "valid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
