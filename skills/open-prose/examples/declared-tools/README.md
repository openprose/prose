# Declared Tools

A minimal example demonstrating the `### Tools` section: how a `.prose.md`
component declares which host CLI executables it requires the host environment
to provide.

The component in `src/json-verifier.prose.md` declares `cli:jq` as a required
host tool. When `prose compile` is run against this directory, the compiler's
`tools_resolver` checks for a `jq` executable on PATH and fails closed with
`tool_unresolved` if it is not available.

See `skills/open-prose/contract-markdown.md` (Tools) and
`skills/open-prose/compiler/index.prose.md` (`tools_resolver`) for the full
specification.
