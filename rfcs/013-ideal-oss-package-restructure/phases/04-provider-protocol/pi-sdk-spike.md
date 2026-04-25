# Pi SDK Spike

Phase 04.4 inspected the current Pi SDK surface and ran a quarantined local
smoke outside the package dependency graph.

## Package Identity

The planning shorthand `pi-mono` maps to the published coding-agent SDK package:

- npm package: `@mariozechner/pi-coding-agent`
- current inspected version: `0.70.2`
- repository: `badlogic/pi-mono`, package directory `packages/coding-agent`
- main SDK entry: `@mariozechner/pi-coding-agent`

The related `@mariozechner/pi-agent` package is a lower-level general-purpose
agent package. The coding-agent package is the better fit for OpenProse because
it includes workspace tools, session management, resource loading, SDK mode, and
RPC mode.

## SDK Surface That Matters

The SDK exports:

- `createAgentSession`
- `createAgentSessionRuntime`
- `createAgentSessionServices`
- `createAgentSessionFromServices`
- `AgentSession`
- `SessionManager`
- `SettingsManager`
- `AuthStorage`
- `ModelRegistry`
- `DefaultResourceLoader`
- tool factories such as `createCodingTools` and `createReadOnlyTools`
- event subscription through `session.subscribe(...)`

The simplest OpenProse provider shape is:

1. create a Pi `AgentSession` with `cwd` set to the provider workspace
2. provide the rendered OpenProse contract as the user prompt
3. subscribe to events for transcript/log capture
4. wait for `session.prompt(...)` to resolve
5. read expected output files from the workspace
6. materialize outputs through the provider artifact path
7. persist `session.sessionId` and, when durable sessions are used, the session
   file as the provider session reference

## Quarantined Smoke

This smoke was run in a temporary directory so the OpenProse package did not
take a dependency before the spike conclusion.

```bash
tmp=$(mktemp -d)
cd "$tmp"
npm init -y >/dev/null
npm install @mariozechner/pi-coding-agent@0.70.2 >/dev/null
cat > spike.mjs <<'EOF'
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@mariozechner/pi-coding-agent';

const authStorage = AuthStorage.create(`${process.cwd()}/auth.json`);
const modelRegistry = ModelRegistry.inMemory(authStorage);
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
  retry: { enabled: false },
});

const { session } = await createAgentSession({
  cwd: process.cwd(),
  authStorage,
  modelRegistry,
  sessionManager: SessionManager.inMemory(),
  settingsManager,
  noTools: 'all',
});

console.log(JSON.stringify({
  sessionId: session.sessionId,
  hasPrompt: typeof session.prompt === 'function',
  isStreaming: session.isStreaming,
}));

session.dispose();
EOF
node spike.mjs
```

Observed result:

```json
{"sessionId":"019dc6a0-768b-775c-91b7-98095eb72ab6","hasPrompt":true,"isStreaming":false}
```

This proves the SDK can create an embeddable in-memory harness session without
pulling in the TUI or CLI.

## Fit Assessment

Recommendation: continue to Phase 04.5 and implement an alpha Pi provider.

Why it fits:

- TypeScript-native SDK, aligned with the Bun package.
- One `AgentSession` maps cleanly to one OpenProse provider execution.
- `cwd` gives OpenProse control over workspace isolation.
- Session ids and optional session files map to `ProviderSessionRef`.
- Events give us transcript, tool execution, and lifecycle telemetry.
- Pi already owns the agent harness layer, so OpenProse can stay focused on the
  meta-harness.

Required adaptation:

- `session.prompt(...)` resolves to `void`, not structured outputs.
- OpenProse must require providers to write declared output files, then validate
  those files after the session ends.
- Auth, model, tools, settings, and session persistence must be provider
  configuration, not IR concerns.
- Provider implementation should keep Pi types behind the provider module so the
  core protocol remains harness-agnostic.

## Alpha Provider Shape

The Phase 04.5 provider should:

- add `@mariozechner/pi-coding-agent` as the first real harness dependency
- accept model/provider/auth config through provider options or environment
- create a Pi session with the request workspace as `cwd`
- use in-memory sessions by default for tests
- allow persisted session storage for resumable local runs
- use read/write/bash tools only when effects allow them
- include explicit output-file instructions in the rendered prompt wrapper
- read expected output files after `prompt()` resolves
- return a protocol-shaped `ProviderResult`
- include an opt-in integration smoke gated by env vars

## Open Questions For Later

- Should durable Pi sessions be default for local runs or only when resume is
  requested?
- Should OpenProse provide a Pi extension for first-class artifact reporting
  instead of file-based output capture?
- Should the hosted platform use Pi directly, Pi inside Sprites, or a separate
  hosted provider implementation?

