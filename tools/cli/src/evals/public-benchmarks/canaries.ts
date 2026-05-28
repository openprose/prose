import { EVAL_SUITE_KIND, EVAL_TASK_KIND, type EvalSuite, type EvalTask, type JsonObject } from "../types.js";

export type PublicBenchmarkId =
	| "miniwob"
	| "toolsandbox"
	| "tau-bench"
	| "appworld"
	| "swe-bench"
	| "terminal-bench"
	| "trail";

export type PublicBenchmarkCompetitorId = "pi" | "hermes" | "dspy-rlm";

export interface PublicBenchmarkCanarySpec {
	id: PublicBenchmarkId;
	title: string;
	stackOrder: number;
	smallestSlice: string;
	observableMetrics: readonly string[];
	expectedTraceFields: readonly string[];
	installRunNotes: string;
	requiresNetwork: boolean;
	requiresDocker: boolean;
}

export interface PublicBenchmarkCompetitorSpec {
	id: PublicBenchmarkCompetitorId;
	title: string;
	adapterName: string;
	notes: string;
}

export interface GeneratePublicBenchmarkCanaryTasksOptions {
	benchmarks?: readonly PublicBenchmarkId[];
	competitors?: readonly PublicBenchmarkCompetitorId[];
}

export const PUBLIC_BENCHMARK_STACK_ORDER: readonly PublicBenchmarkId[] = [
	"miniwob",
	"toolsandbox",
	"tau-bench",
	"appworld",
	"swe-bench",
	"terminal-bench",
	"trail",
];

export const PUBLIC_BENCHMARK_COMPETITORS: readonly PublicBenchmarkCompetitorSpec[] = [
	{
		id: "pi",
		title: "Pi",
		adapterName: "pi",
		notes: "Use the Pi eval adapter against a single public-benchmark fixture prompt.",
	},
	{
		id: "hermes",
		title: "Hermes",
		adapterName: "hermes",
		notes: "Use the Hermes eval adapter against a single public-benchmark fixture prompt.",
	},
	{
		id: "dspy-rlm",
		title: "DSPy RLM",
		adapterName: "dspy-rlm",
		notes: "Use the DSPy RLM eval adapter against a single public-benchmark fixture prompt.",
	},
];

export const PUBLIC_BENCHMARK_CANARY_SPECS: readonly PublicBenchmarkCanarySpec[] = [
	{
		id: "miniwob",
		title: "MiniWoB",
		stackOrder: 1,
		smallestSlice: "one deterministic click-button episode with a fixed seed",
		observableMetrics: ["success", "reward", "episode_steps"],
		expectedTraceFields: ["benchmark_id", "environment_id", "seed", "action_trace", "final_reward"],
		installRunNotes:
			"Keep browser automation disabled for this fixture; a live run would use the MiniWoB environment package and one seeded task.",
		requiresNetwork: false,
		requiresDocker: false,
	},
	{
		id: "toolsandbox",
		title: "ToolSandbox",
		stackOrder: 2,
		smallestSlice: "one stateful tool-use scenario with a mocked calendar/contact state",
		observableMetrics: ["scenario_success", "tool_call_validity", "state_diff_match"],
		expectedTraceFields: ["benchmark_id", "scenario_id", "tool_calls", "state_snapshots", "state_diff"],
		installRunNotes:
			"Use the fixture state only; a live run would install the benchmark harness and replay one scenario against its local tools.",
		requiresNetwork: false,
		requiresDocker: false,
	},
	{
		id: "tau-bench",
		title: "tau-bench",
		stackOrder: 3,
		smallestSlice: "one retail or airline task with a frozen user goal and tool database",
		observableMetrics: ["task_success", "reward", "invalid_tool_calls"],
		expectedTraceFields: ["benchmark_id", "domain", "task_id", "tool_calls", "reward_breakdown"],
		installRunNotes:
			"Use a static task record; a live run would install tau-bench and execute a single domain task with its simulator.",
		requiresNetwork: false,
		requiresDocker: false,
	},
	{
		id: "appworld",
		title: "AppWorld",
		stackOrder: 4,
		smallestSlice: "one API task with a frozen app state and held-out assertions",
		observableMetrics: ["task_goal_success", "api_call_validity", "assertion_pass_rate"],
		expectedTraceFields: ["benchmark_id", "task_id", "api_calls", "state_checks", "assertion_results"],
		installRunNotes:
			"Use the canary description only; a live run would install AppWorld and run one task against local app APIs.",
		requiresNetwork: false,
		requiresDocker: false,
	},
	{
		id: "swe-bench",
		title: "SWE-bench",
		stackOrder: 5,
		smallestSlice: "one tiny repository issue with a fixed base commit and patch check",
		observableMetrics: ["resolved", "patch_applies", "tests_passed"],
		expectedTraceFields: ["benchmark_id", "instance_id", "base_commit", "patch", "test_output"],
		installRunNotes:
			"Do not clone or patch for this fixture; a live run would materialize one repository instance and run its tests.",
		requiresNetwork: true,
		requiresDocker: true,
	},
	{
		id: "terminal-bench",
		title: "Terminal-Bench",
		stackOrder: 6,
		smallestSlice: "one shell task with a fixture workspace and deterministic checker",
		observableMetrics: ["task_success", "command_exit_codes", "checker_passed"],
		expectedTraceFields: ["benchmark_id", "task_id", "commands", "files_touched", "checker_output"],
		installRunNotes:
			"Use a static shell transcript target; a live run would start one benchmark task environment and run its checker.",
		requiresNetwork: true,
		requiresDocker: true,
	},
	{
		id: "trail",
		title: "TRAIL",
		stackOrder: 7,
		smallestSlice: "one trajectory task with a fixed observation, action log, and oracle outcome",
		observableMetrics: ["task_success", "trajectory_score", "oracle_match"],
		expectedTraceFields: ["benchmark_id", "task_id", "observations", "actions", "oracle_outcome"],
		installRunNotes:
			"Keep this as trace-shape evidence; a live run would install the TRAIL harness and execute one published task.",
		requiresNetwork: false,
		requiresDocker: false,
	},
];

const CANARY_SPECS_BY_ID = new Map(PUBLIC_BENCHMARK_CANARY_SPECS.map((spec) => [spec.id, spec]));
const COMPETITORS_BY_ID = new Map(PUBLIC_BENCHMARK_COMPETITORS.map((competitor) => [competitor.id, competitor]));

export function generatePublicBenchmarkCanaryTasks(
	options: GeneratePublicBenchmarkCanaryTasksOptions = {},
): EvalTask[] {
	const specs = selectCanarySpecs(options.benchmarks ?? PUBLIC_BENCHMARK_STACK_ORDER);
	const competitors = selectCompetitors(options.competitors ?? PUBLIC_BENCHMARK_COMPETITORS.map((competitor) => competitor.id));

	return specs.flatMap((spec) => competitors.map((competitor) => buildPublicBenchmarkCanaryTask(spec, competitor)));
}

export function createPublicBenchmarkCanarySuite(
	options: GeneratePublicBenchmarkCanaryTasksOptions = {},
): EvalSuite {
	return {
		kind: EVAL_SUITE_KIND,
		id: "public-benchmark-adapter-canaries",
		title: "Public Benchmark Adapter Canaries",
		metadata: {
			description: "Fixture-only public benchmark canaries for external-context adapter evidence.",
			evidenceUse: "external-context",
			reportUse: "adapter-canary",
		},
		tasks: generatePublicBenchmarkCanaryTasks(options),
	};
}

export const publicBenchmarkCanarySuite: EvalSuite = createPublicBenchmarkCanarySuite();

function selectCanarySpecs(ids: readonly PublicBenchmarkId[]): PublicBenchmarkCanarySpec[] {
	return ids.map((id) => {
		const spec = CANARY_SPECS_BY_ID.get(id);
		if (spec === undefined) {
			throw new Error(`Unsupported public benchmark canary: ${id}`);
		}

		return spec;
	});
}

function selectCompetitors(ids: readonly PublicBenchmarkCompetitorId[]): PublicBenchmarkCompetitorSpec[] {
	return ids.map((id) => {
		const competitor = COMPETITORS_BY_ID.get(id);
		if (competitor === undefined) {
			throw new Error(`Unsupported public benchmark competitor: ${id}`);
		}

		return competitor;
	});
}

function buildPublicBenchmarkCanaryTask(
	spec: PublicBenchmarkCanarySpec,
	competitor: PublicBenchmarkCompetitorSpec,
): EvalTask {
	const requiresNetwork = String(spec.requiresNetwork);
	const requiresDocker = String(spec.requiresDocker);
	const traceFields = spec.expectedTraceFields.join(",");
	const metadata: JsonObject = {
		adapterName: competitor.adapterName,
		benchmarkId: spec.id,
		benchmarkTitle: spec.title,
		competitorId: competitor.id,
		evidenceUse: "external-context",
		executionMode: "fixture-only",
		expectedTraceFields: [...spec.expectedTraceFields],
		installRunNotes: spec.installRunNotes,
		observableMetrics: [...spec.observableMetrics],
		reportUse: "adapter-canary",
		requiresDocker: spec.requiresDocker,
		requiresNetwork: spec.requiresNetwork,
		smallestSlice: spec.smallestSlice,
		stackOrder: spec.stackOrder,
	};

	return {
		kind: EVAL_TASK_KIND,
		id: `public-${spec.id}-${competitor.id}-adapter-canary`,
		title: `${spec.title} ${competitor.title} adapter canary`,
		prompt: [
			"Adapter canary fixture. Do not install packages, start Docker, call live services, or execute the benchmark.",
			"Read the fixture fields below and emit the requested canary record.",
			`competitor_id=${competitor.id}`,
			`adapter_name=${competitor.adapterName}`,
			`benchmark_id=${spec.id}`,
			`benchmark_title=${spec.title}`,
			`smallest_slice=${spec.smallestSlice}`,
			`observable_metrics=${spec.observableMetrics.join(",")}`,
			`expected_trace_fields=${traceFields}`,
			`install_run_notes=${spec.installRunNotes}`,
			`requires_network=${requiresNetwork}`,
			`requires_docker=${requiresDocker}`,
			"Required output lines:",
			"report_use=adapter-canary",
			"evidence_use=external-context",
			`competitor_id=${competitor.id}`,
			`benchmark_id=${spec.id}`,
			`requires_network=${requiresNetwork}`,
			`requires_docker=${requiresDocker}`,
			`trace_fields=${traceFields}`,
		].join("\n"),
		expected: {
			exitCode: 0,
			stdoutContains: [
				"report_use=adapter-canary",
				"evidence_use=external-context",
				`competitor_id=${competitor.id}`,
				`benchmark_id=${spec.id}`,
				`requires_network=${requiresNetwork}`,
				`requires_docker=${requiresDocker}`,
				`trace_fields=${traceFields}`,
			],
			stderrExcludes: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "API_KEY", "secret"],
		},
		metadata,
		tags: ["public-benchmark", "adapter-canary", "external-context", spec.id, competitor.id],
		timeoutMs: 30_000,
	};
}
