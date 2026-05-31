// The CLI ↔ reactor LOCAL-SERVE adapters (PHASE5-UNRED §5b). REWRITTEN for the
// post-judge reactor: the demolished `createLocalModelGateway` /
// `createLocalPolicyAuthorAgent` (a judge-era "model gateway returns a status" +
// a "policy author returns a policy artifact") are GONE — there is no model
// gateway and no policy artifact in the new model. The run boundary is the
// agent-render adapter (`AsyncMountedRender`): a render attestation, not a
// verdict.
//
// What a LOCAL serve needs is a render BODY to mount. The offline/local serve
// injects a deterministic fake `AsyncMountedRender` that re-publishes the prior
// world-model unchanged (a no-op render that records a `rendered` receipt without
// a model call) — the same harness seam a live `createAgentRender` hits, minus
// the SDK tool loop. The live render path is a deep import of
// `@openprose/reactor/adapters/agent-render` that the OFFLINE core deliberately
// does not surface (keeping a keyless CLI build provider-free); the CLI never
// constructs it here. This factory therefore returns the
// {@link RepositoryServeReactorOptions} the daemon threads into
// {@link loadRepositoryReactor}, carrying the injected render factory.

import {
	EMPTY_SEMANTIC_DIFF,
	type AsyncMountedRender,
	type Cost,
	type WakeSource,
	type WorldModelStore,
} from "@openprose/reactor";
import type { RepositoryServeReactorOptions } from "./repository-serve.js";
import type { RepositoryRenderFactory } from "./repository-reactor.js";

export const REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER = "openprose-cli-local";
export const REPOSITORY_SERVE_LOCAL_REACTOR_MODEL = "deterministic-no-op-render-v0";

export interface LocalRepositoryServeReactorOptionsInput {
	env?: Readonly<Record<string, string | undefined>>;
	now?: () => string;
}

/**
 * Build the {@link RepositoryServeReactorOptions} for the OFFLINE/local serve
 * path (replaces `createLocalRepositoryServeReactorOptions`'s judge-era body).
 * The clock is a wall clock; the render factory is the deterministic local render
 * below — no model, no `@openai/agents`, no provider construction.
 */
export function createLocalRepositoryServeReactorOptions(
	input: LocalRepositoryServeReactorOptionsInput = {},
): RepositoryServeReactorOptions {
	const now = input.now ?? (() => new Date().toISOString());
	return {
		clock: { now },
		buildRender: createLocalRenderFactory(),
	};
}

/**
 * A deterministic, offline render FACTORY (the local-serve render body). Each
 * mounted render re-publishes the node's PRIOR world-model files unchanged and
 * reports a zero-token `self`-sourced cost. This is the honest local stand-in for
 * a live `createAgentRender`: it commits through the SAME store the reactor
 * commits to (so boot logs a `rendered` receipt and the content-address is real),
 * but performs no model work. A keyed/live serve injects an `AsyncMountedRender`
 * built over the agent-render deep import instead.
 */
export function createLocalRenderFactory(): RepositoryRenderFactory {
	return (_store: WorldModelStore): AsyncMountedRender => {
		return async (context) => ({
			world_model: context.prior.files,
			semantic_diff: EMPTY_SEMANTIC_DIFF,
			// The receipt's surprise_cause MUST echo the node's wake source (the
			// reactor verifies cost.surprise_cause === wake.source); an IR-derived
			// topology wakes nodes via `external`/`input`, not just `self`, so a
			// hardcoded "self" fails receipt validation and persists no receipt.
			cost: localRenderCost(context.wake.source),
		});
	};
}

function localRenderCost(surpriseCause: WakeSource): Cost {
	return {
		provider: REPOSITORY_SERVE_LOCAL_REACTOR_PROVIDER,
		model: REPOSITORY_SERVE_LOCAL_REACTOR_MODEL,
		tokens: { fresh: 0, reused: 0 },
		surprise_cause: surpriseCause,
	};
}
