import type {
  ComponentIR,
  Diagnostic,
  EffectIR,
  RunPolicyRecord,
} from "../types.js";

export interface PolicyBinding {
  port: string;
  policy_labels: string[];
}

export interface RuntimePolicyDecision {
  labels: string[];
  input_labels: Record<string, string[]>;
  output_labels: Record<string, string[]>;
  declassifications: RunPolicyRecord["declassifications"];
  budgets: RunPolicyRecord["budgets"];
  idempotency_keys: RunPolicyRecord["idempotency_keys"];
  diagnostics: Diagnostic[];
}

export interface EvaluateRuntimePolicyOptions {
  component: ComponentIR;
  inputBindings: PolicyBinding[];
  approvedEffects?: string[];
  performedEffects?: string[];
}

const ROLE_ACCESS_KEYS = new Set(["callable_by"]);
const IDEMPOTENT_EFFECTS = new Set([
  "delivers",
  "mutates_repo",
  "mutates_external",
  "writes_memory",
]);
const SAFE_EFFECTS = new Set(["pure", "read_external"]);

export function evaluateRuntimePolicy(
  options: EvaluateRuntimePolicyOptions,
): RuntimePolicyDecision {
  const approvedEffects = new Set(options.approvedEffects ?? []);
  const inputLabels = inputLabelsByPort(options.component, options.inputBindings);
  const inheritedLabels = mergePolicyLabels(
    componentDataLabels(options.component),
    ...Object.values(inputLabels),
  );
  const diagnostics: Diagnostic[] = [];
  const declassifications: RunPolicyRecord["declassifications"] = [];
  const outputLabels: Record<string, string[]> = {};
  const canDeclassify =
    options.component.effects.some((effect) => effect.kind === "declassifies") &&
    approvedEffects.has("declassifies");

  for (const port of options.component.ports.ensures) {
    const declaredLabels = mergePolicyLabels(port.policy_labels);
    const effectiveLabels =
      declaredLabels.length > 0 ? declaredLabels : inheritedLabels;
    const loweredLabels = inheritedLabels.filter(
      (label) => !effectiveLabels.includes(label),
    );
    outputLabels[port.name] = effectiveLabels;

    if (loweredLabels.length === 0) {
      continue;
    }

    if (canDeclassify) {
      declassifications.push({
        from_labels: loweredLabels,
        to_labels: effectiveLabels,
        component_ref: options.component.name,
        authorized_by: "approved_effect",
      });
      continue;
    }

    diagnostics.push({
      severity: "error",
      code: "policy_declassification_required",
      message: `Output '${options.component.name}.${port.name}' lowers labels [${loweredLabels.join(", ")}] without approved declassification.`,
      source_span: port.source_span,
    });
  }

  diagnostics.push(
    ...performedEffectDiagnostics(
      options.component,
      options.performedEffects ?? [],
      approvedEffects,
    ),
  );

  return {
    labels: mergePolicyLabels(
      inheritedLabels,
      ...Object.values(outputLabels),
    ),
    input_labels: inputLabels,
    output_labels: outputLabels,
    declassifications,
    budgets: budgetRecords(options.component.effects),
    idempotency_keys: idempotencyRecords(options.component.effects),
    diagnostics,
  };
}

export function runPolicyRecord(
  decision: RuntimePolicyDecision,
  performedEffects: string[] = [],
  diagnostics: Diagnostic[] = [],
): RunPolicyRecord {
  return {
    labels: decision.labels,
    input_labels: decision.input_labels,
    output_labels: decision.output_labels,
    declassifications: decision.declassifications,
    budgets: decision.budgets,
    idempotency_keys: decision.idempotency_keys,
    performed_effects: [...new Set(performedEffects)].sort(),
    diagnostics: [...decision.diagnostics, ...diagnostics],
  };
}

export function componentInputPolicyLabels(
  component: ComponentIR,
  portLabels: string[],
  inheritedLabels: string[] = [],
): string[] {
  return mergePolicyLabels(componentDataLabels(component), portLabels, inheritedLabels);
}

export function componentDataLabels(component: ComponentIR): string[] {
  return mergePolicyLabels(
    ...Object.entries(component.access.rules)
      .filter(([key]) => !ROLE_ACCESS_KEYS.has(key))
      .map(([, labels]) => labels),
  );
}

export function mergePolicyLabels(...groups: string[][]): string[] {
  return Array.from(
    new Set(
      groups
        .flat()
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function inputLabelsByPort(
  component: ComponentIR,
  bindings: PolicyBinding[],
): Record<string, string[]> {
  const labels: Record<string, string[]> = {};
  for (const port of component.ports.requires) {
    const binding = bindings.find((candidate) => candidate.port === port.name);
    labels[port.name] = componentInputPolicyLabels(
      component,
      port.policy_labels,
      binding?.policy_labels ?? [],
    );
  }
  return labels;
}

function performedEffectDiagnostics(
  component: ComponentIR,
  performedEffects: string[],
  approvedEffects: Set<string>,
): Diagnostic[] {
  const declared = new Set(component.effects.map((effect) => effect.kind));
  const diagnostics: Diagnostic[] = [];

  for (const effect of performedEffects) {
    if (!declared.has(effect)) {
      diagnostics.push({
        severity: "error",
        code: "policy_performed_effect_undeclared",
        message: `Provider reported undeclared effect '${effect}' for '${component.name}'.`,
        source_span: component.source.span,
      });
      continue;
    }

    if (!SAFE_EFFECTS.has(effect) && !approvedEffects.has(effect)) {
      diagnostics.push({
        severity: "error",
        code: "policy_performed_effect_unapproved",
        message: `Provider reported unapproved effect '${effect}' for '${component.name}'.`,
        source_span: component.effects.find((candidate) => candidate.kind === effect)
          ?.source_span,
      });
    }
  }

  return diagnostics;
}

function budgetRecords(effects: EffectIR[]): RunPolicyRecord["budgets"] {
  return effects
    .filter((effect) => effect.kind === "metered")
    .map((effect) => {
      const limit = numericConfig(effect, ["max_calls", "max", "limit"]);
      return {
        effect: effect.kind,
        limit,
        unit: stringConfig(effect, ["unit"]) ?? "calls",
        status: limit === null ? "not_declared" : "declared",
      };
    });
}

function idempotencyRecords(
  effects: EffectIR[],
): RunPolicyRecord["idempotency_keys"] {
  return effects
    .filter((effect) => IDEMPOTENT_EFFECTS.has(effect.kind))
    .map((effect) => {
      const key = stringConfig(effect, ["idempotency_key", "idempotency"]);
      return {
        effect: effect.kind,
        key,
        status: key ? "declared" : "missing",
      };
    });
}

function numericConfig(effect: EffectIR, keys: string[]): number | null {
  for (const key of keys) {
    const value = effect.config[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function stringConfig(effect: EffectIR, keys: string[]): string | null {
  for (const key of keys) {
    const value = effect.config[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
