# Mirror Notes

Canonical source:
https://github.com/openprose/grant-finder/tree/main/examples/openprose

Public mirror:
https://github.com/openprose/prose/tree/main/skills/open-prose/examples/grant-radar

This directory is mirrored into `openprose/prose` with `git subtree` from the
`openprose/grant-finder` `examples-mirror` branch. Edit the canonical source in
`openprose/grant-finder/examples/openprose/`, then refresh the split branch and
open a downstream pull request in `openprose/prose`.

Keep files in this directory portable:

- Use relative links only for files that live inside this directory.
- Use canonical `https://github.com/openprose/grant-finder/...` links for
  schemas, CLI source, host-harness skills, ADRs, or other files outside this
  directory.
- Write run commands from this example directory, not from a repository root.

Maintainer refresh from `openprose/grant-finder`:

```bash
git branch -D examples-mirror 2>/dev/null
git subtree split --prefix=examples/openprose -b examples-mirror
safe-push origin examples-mirror --force-with-lease
```

Downstream refresh in `openprose/prose`:

```bash
git subtree pull --prefix=skills/open-prose/examples/grant-radar \
  https://github.com/openprose/grant-finder examples-mirror --squash
```
