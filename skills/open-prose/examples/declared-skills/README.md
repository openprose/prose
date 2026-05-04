# Declared Skills

A minimal example demonstrating the `### Skills` section: how a `.prose.md`
component declares which agent harness skills it requires the host harness to
provide.

The component in `src/invoice-extractor.prose.md` declares
`document-skills:pdf` as a required skill. When `prose compile` is run against
this directory, the compiler's `skills_resolver` checks for the named skill in
the recognized search paths and fails closed with `skill_unresolved` if it is
not installed.

See `skills/open-prose/contract-markdown.md` (Skills) and
`skills/open-prose/compiler/index.prose.md` (`skills_resolver`) for the full
specification.
