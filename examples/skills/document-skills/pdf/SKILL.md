---
name: pdf
description: |
  Stub `document-skills:pdf` skill for the @openprose/examples package. The
  real plugin-marketplace skill reads PDFs end-to-end; this fixture exists so
  programs that declare `document-skills:pdf` (e.g. quarterly-investor-update)
  can resolve the skill against the package's default `./skills/` search root,
  including in CI where the harness skills are not installed.
---

# pdf (fixture)

This is a fixture stub. It is not the real `document-skills:pdf` skill. Install
the real skill with `/plugin marketplace install document-skills` if you want
to do real PDF work — OpenProse never installs harness skills for you (BYO
harness invariant).
