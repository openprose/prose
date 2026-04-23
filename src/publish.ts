import { packagePath } from "./package";
import type { PublishCheckItem, PublishCheckResult } from "./types";

export interface PublishCheckOptions {
  strict?: boolean;
}

export async function publishCheckPath(
  path: string,
  options: PublishCheckOptions = {},
): Promise<PublishCheckResult> {
  const metadata = await packagePath(path);
  const strict = options.strict === true;
  const checks: PublishCheckItem[] = [];

  checks.push(
    makeCheck(
      "components_present",
      metadata.components.length > 0 ? "pass" : "fail",
      metadata.components.length > 0
        ? `${metadata.components.length} component(s) found.`
        : "No canonical .prose.md components found in package root.",
    ),
  );

  const errorDiagnostics = metadata.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  checks.push(
    makeCheck(
      "compile_errors",
      errorDiagnostics.length === 0 ? "pass" : "fail",
      errorDiagnostics.length === 0
        ? "No error diagnostics."
        : `${errorDiagnostics.length} error diagnostic(s) must be resolved before publish.`,
    ),
  );

  checks.push(
    makeCheck(
      "package_version",
      metadata.manifest.version ? "pass" : "fail",
      metadata.manifest.version
        ? `Version ${metadata.manifest.version} declared.`
        : "Missing package version in prose.package.json.",
    ),
  );
  checks.push(
    makeCheck(
      "source_git",
      metadata.manifest.source.git ? "pass" : "fail",
      metadata.manifest.source.git
        ? `Source git set to ${metadata.manifest.source.git}.`
        : "Missing source.git in prose.package.json.",
    ),
  );
  checks.push(
    makeCheck(
      "source_sha",
      metadata.manifest.source.sha ? "pass" : "fail",
      metadata.manifest.source.sha
        ? `Source sha set to ${metadata.manifest.source.sha}.`
        : "Missing source.sha in prose.package.json.",
    ),
  );

  checks.push(
    makeCheck(
      "typed_ports",
      metadata.quality.typed_port_coverage === 1 ? "pass" : strict ? "fail" : "warn",
      metadata.quality.typed_port_coverage === 1
        ? "All published ports are typed."
        : "One or more published ports remain untyped.",
    ),
  );

  checks.push(
    makeCheck(
      "effect_declarations",
      metadata.quality.effect_declaration_ratio === 1 ? "pass" : strict ? "fail" : "warn",
      metadata.quality.effect_declaration_ratio === 1
        ? "All components declare effects."
        : "One or more components do not declare effects.",
    ),
  );

  checks.push(
    makeCheck(
      "eval_links",
      metadata.manifest.no_evals ? strict ? "fail" : "warn" : "pass",
      metadata.manifest.no_evals
        ? "Package has no linked evals; publish should record no_evals or add eval coverage."
        : `${metadata.manifest.evals.length} eval link(s) declared.`,
    ),
  );

  checks.push(
    makeCheck(
      "example_links",
      metadata.manifest.examples.length > 0 ? "pass" : strict ? "fail" : "warn",
      metadata.manifest.examples.length > 0
        ? `${metadata.manifest.examples.length} example link(s) declared.`
        : "Package has no linked examples.",
    ),
  );

  const blockers = checks.filter((check) => check.status === "fail").map((check) => check.detail);
  const warnings = checks.filter((check) => check.status === "warn").map((check) => check.detail);
  const status = blockers.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";

  return {
    publish_check_version: "0.1",
    package_name: metadata.manifest.name,
    package_version: metadata.manifest.version,
    strict,
    status,
    blockers,
    warnings,
    checks,
    metadata,
  };
}

export function renderPublishCheckText(result: PublishCheckResult): string {
  const heading = `Publish check: ${result.status.toUpperCase()} ${result.package_name}${
    result.package_version ? `@${result.package_version}` : ""
  }`;
  const lines = [heading];

  for (const check of result.checks) {
    lines.push(`- [${check.status}] ${check.name}: ${check.detail}`);
  }

  return `${lines.join("\n")}\n`;
}

function makeCheck(
  name: string,
  status: PublishCheckItem["status"],
  detail: string,
): PublishCheckItem {
  return { name, status, detail };
}
