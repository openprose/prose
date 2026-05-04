# Declared Skills

A minimal example demonstrating the `### Skills` section: how a `.prose.md`
component declares which agent harness skills it requires the host harness to
provide.

The component in `src/invoice-extractor.prose.md` declares
`document-skills:pdf` as a required skill. When `prose compile` is run against
this directory, Forme verifies the named skill is installed in one of the
recognized search paths and fails closed with `skill_unresolved` if it is not.

See `skills/open-prose/contract-markdown.md` (Skills section) for the full
specification.
