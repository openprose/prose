# 01.1 Deployment Identity

## Build

- Add deployment types to the OSS public type surface.
- Define a deployment as:
  - deployment id/slug/name
  - organization or local owner
  - root package identity
  - package version identity
  - source git/source sha/source subpath
  - environment id/name
  - deployment mode: `local`, `dev`, `staging`, `production`
  - state root
- Add docs explaining that Git is provenance, not deployment identity.
- Keep `deployment_id` stable across package promotion. Put active package
  version and semantic hash in a separate release key.

## Tests

- Unit test deployment identity normalization.
- Unit test that two deployments can reference the same package version.
- Unit test that a deployment can be promoted to a new package version while
  preserving its deployment id.
- Run `bun run typecheck`.

## Commit

Commit as `feat: add openprose deployment identity`.

## Signpost

Record the identity decision and examples of valid deployment ids.
