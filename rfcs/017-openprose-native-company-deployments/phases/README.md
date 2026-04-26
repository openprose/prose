# RFC 017 Phase Plan

This plan starts in the OSS package and then rolls into hosted platform
integration. The product goal is to run `@openprose/prose-openprose` as an
OpenProse Native Company in dev.

## Sequence

1. OSS deployment vocabulary and manifests.
2. OSS package-level entrypoint graph planning.
3. OSS local deployment runtime and state store.
4. OSS reference-company acceptance ladder.
5. Platform deployment data model.
6. Platform deployment control plane and distributed execution.
7. Platform company cockpit.
8. Dev environment acceptance and release evidence.

## Per-Slice Discipline

Every sub-phase must:

1. Re-read this RFC plus the sub-phase file.
2. State the active slice before editing.
3. Make the smallest coherent change.
4. Run the named focused tests.
5. Run broader tests named by the phase.
6. Write a signpost:
   - OSS slices: `rfcs/017-openprose-native-company-deployments/signposts/`
   - Platform slices: platform planning signpost under the active reactive
     OpenProse build directory, or a new linked platform signpost directory if
     one is created for this RFC.
7. Commit with the suggested message or a narrower accurate message.
8. Push the active branch.
9. Start the next sub-phase only when the relevant repo is clean.

## Backpressure Commands

OSS baseline:

```bash
bun run typecheck
bun test
bun run measure:examples
bun run confidence:runtime
bun run prose publish-check /Users/sl/code/openprose/customers/prose-openprose --strict
```

Platform baseline:

```bash
pnpm --filter @openprose/api typecheck
pnpm --filter @openprose/api test -- openprose-registry openprose-runtime
pnpm --filter @openprose/run typecheck
pnpm --filter @openprose/run build
pnpm --filter @openprose/api smoke:openprose:dev-doctor -- --include-migration-status=true --include-public-catalog-audit=true
```

Dev acceptance:

```bash
pnpm --filter @openprose/api smoke:openprose:remote-dev -- --include-sprites=true --include-browser=true --include-public-web=true --include-distributed=true
```

