---
name: docx
description: |
  Stub `document-skills:docx` skill for the @openprose/examples package. The
  real plugin-marketplace skill renders Word documents; this fixture exists
  so programs that declare `document-skills:docx` (e.g.
  quarterly-investor-update) can resolve the skill against the package's
  default `./skills/` search root, including in CI where the harness skills
  are not installed.
---

# docx (fixture)

This is a fixture stub. It is not the real `document-skills:docx` skill.
Install the real skill with `/plugin marketplace install document-skills` if
you want to render real `.docx` output — OpenProse never installs harness
skills for you (BYO harness invariant).
