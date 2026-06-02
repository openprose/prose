// @openprose/reactor/agents — the `@openai/agents` escape hatch.
//
// This subpath is the peer-dep-isolated home for the live agent backends: the
// agent-render surface (`createAgentRender`, provider factories, the cwd/shell/
// spawn tools, skill preflight, working-dir helpers) and the compile-session
// surface (`runCompileSession`, `compileForme` / `compileCanonicalizer` /
// `compilePostcondition`, the contract loader + output schemas). Importing it
// pulls the optional `@openai/agents` + `zod` peers; the keyless core never
// loads them.

export * from "../adapters/agent-render";
export * from "../adapters/agent-compile";
