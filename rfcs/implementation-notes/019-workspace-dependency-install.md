# Implementation Note 019: Workspace Dependency Install

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 011

## Purpose

The nineteenth implementation wave makes `prose install` useful for real local
workspaces, not only explicit registry refs.

The key shift is from:

- "can we install one package by ref?"

to:

- "can a workspace bootstrap its direct and transitive dependencies into
  `.deps/` using the same package identities?"

## Scope

Added:

1. `prose install <path>` workspace dependency scanning.
2. transitive dependency install through installed source trees.
3. `--source-override package=path` for local-first development and tests.
4. executable-source filtering so docs do not masquerade as install inputs.
5. fixture coverage for transitive local install with source overrides.

## Non-Goals

- No hosted catalog reads yet.
- No automatic version updates yet.
- No install-by-query flow yet.
- No runtime dependency auto-install during `prose run`.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose install <path>` installs direct and transitive dependency repos into
  `.deps/`.
- `--source-override` can redirect a canonical package identity to a local git
  clone without changing the lockfile identity.

## Progress Log

- 2026-04-23: Added workspace-scoped dependency install with transitive scans
  and local source overrides.

## Current Capabilities

- local workspaces can now bootstrap dependency state through the Bun CLI.
- std/co consumers no longer need to install registry refs one at a time during
  local development.

## Next Slice

The next implementation slice should upgrade `packages/std` and `packages/co`
into explicit publishable packages, then validate end-to-end local install and
search flows against them.
