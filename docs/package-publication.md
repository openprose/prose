# Package Publication

The repository root is a source workspace. It is intentionally private.

The publishable artifact is generated under `dist/`:

```bash
bun run build:binary
```

That creates:

```text
dist/
  prose
  package.json
```

`dist/package.json` is the package-manager surface:

- `name`: inherited from the source package
- `version`: inherited from the source package
- `bin.prose`: `./prose`
- `files`: `["prose"]`
- no `private` field

This keeps the open source repo clean as a development workspace while making
the public package an executable CLI artifact.

## Required Checks

Run:

```bash
bun run smoke:binary
bun run smoke:cold-start
bun test test/binary-package.test.ts
```

What they prove:

- `smoke:binary` builds `dist/prose`, renders help, and compiles a repo example.
- `smoke:cold-start` copies only the generated dist package into a temp install
  root, creates a program outside the source checkout, then proves `help`,
  `compile`, `plan`, `run`, `status`, and `trace` through that copied binary.
- `test/binary-package.test.ts` verifies the root package stays private and the
  generated dist metadata points `bin.prose` at the compiled artifact.

For the full launch gate, run:

```bash
bun run confidence:runtime
bun run evidence:launch
```

## What Not To Publish

Do not publish the source workspace directly until the package boundary is
deliberately changed. The source workspace contains development scripts,
examples, docs, tests, and RFCs. The launch artifact is the compiled CLI
package.

