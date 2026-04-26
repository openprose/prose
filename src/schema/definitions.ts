import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { Diagnostic, SourceSpan } from "../types.js";
import type { SchemaDefinitionMap } from "./types.js";

interface PackageConfig {
  schemas?: string[];
}

export interface LoadedSchemaDefinitions {
  root: string | null;
  definitions: SchemaDefinitionMap;
  diagnostics: Diagnostic[];
}

export async function loadPackageSchemaDefinitionsForPath(
  path: string,
): Promise<LoadedSchemaDefinitions> {
  const root = await nearestPackageRoot(path);
  if (!root) {
    return { root: null, definitions: {}, diagnostics: [] };
  }

  const config = await readPackageConfig(root);
  const definitions: SchemaDefinitionMap = {};
  const diagnostics: Diagnostic[] = [];

  for (const schemaPath of config?.schemas ?? []) {
    const normalized = schemaPath.trim();
    if (!normalized) {
      continue;
    }
    const absolutePath = resolve(root, normalized);
    if (!isWithin(root, absolutePath)) {
      diagnostics.push({
        severity: "warning",
        code: "schema_resource_outside_package",
        message: `Schema resource '${normalized}' resolves outside the package root and was ignored.`,
        source_span: manifestSpan(root),
      });
      continue;
    }
    if (!existsSync(absolutePath)) {
      diagnostics.push({
        severity: "warning",
        code: "schema_resource_missing",
        message: `Schema resource '${normalized}' does not exist.`,
        source_span: manifestSpan(root),
      });
      continue;
    }

    let schema: unknown;
    try {
      schema = JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
    } catch (error) {
      diagnostics.push({
        severity: "warning",
        code: "schema_resource_invalid_json",
        message: `Schema resource '${normalized}' is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
        source_span: manifestSpan(root),
      });
      continue;
    }

    collectDefinitions(definitions, schema, normalized);
  }

  return { root, definitions, diagnostics };
}

function collectDefinitions(
  definitions: SchemaDefinitionMap,
  schema: unknown,
  schemaPath: string,
): void {
  if (!isRecord(schema)) {
    return;
  }

  const defs = isRecord(schema.$defs)
    ? schema.$defs
    : isRecord(schema.definitions)
      ? schema.definitions
      : {};
  for (const [name, definition] of Object.entries(defs)) {
    definitions[name] = definition;
  }

  for (const name of topLevelDefinitionNames(schema, schemaPath)) {
    definitions[name] = schema;
  }
}

function topLevelDefinitionNames(schema: Record<string, unknown>, schemaPath: string): string[] {
  const names = new Set<string>();
  if (typeof schema.title === "string" && schema.title.trim()) {
    names.add(schema.title.trim());
  }
  if (typeof schema.$id === "string" && schema.$id.trim()) {
    const idName = basename(schema.$id.trim()).replace(/\.[^.]+$/, "");
    if (idName) {
      names.add(idName);
    }
  }

  const fileName = basename(schemaPath, extname(schemaPath));
  const fileStem = fileName.replace(/\.schema$/, "");
  if (fileStem && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(fileStem)) {
    names.add(fileStem);
  }

  return [...names];
}

async function nearestPackageRoot(path: string): Promise<string | null> {
  let current = await startingDirectory(path);
  while (true) {
    if (existsSync(resolve(current, "prose.package.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function startingDirectory(path: string): Promise<string> {
  const resolved = resolve(path);
  try {
    const info = await stat(resolved);
    return info.isDirectory() ? resolved : dirname(resolved);
  } catch {
    return dirname(resolved);
  }
}

async function readPackageConfig(root: string): Promise<PackageConfig | null> {
  try {
    return JSON.parse(await readFile(resolve(root, "prose.package.json"), "utf8")) as PackageConfig;
  } catch {
    return null;
  }
}

function manifestSpan(root: string): SourceSpan {
  return {
    path: resolve(root, "prose.package.json"),
    start_line: 1,
    end_line: 1,
  };
}

function isWithin(root: string, path: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
