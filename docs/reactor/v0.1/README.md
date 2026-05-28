# Reactor v0.1 — published documents

Canonical source for the v0.1 Reactor launch documents. These render to
`reports.openprose.ai/reactor/v0.1/...` via the Astro app at
[`openprose/platform`](https://github.com/openprose/platform)
`/apps/reports/` (which reads this directory via the
`external/prose` submodule pin).

| File | URL when published | Audience |
| --- | --- | --- |
| [`article.md`](./article.md) | `/reactor/v0.1/article` | Generalist launch piece — "When the Conversation Ends, the Responsibility Doesn't." |
| [`report.md`](./report.md) | `/reactor/v0.1/report` | The technical case + §10 limitations + §9 reproducibility recipe. |
| `assets/` (future) | served from `/reactor/v0.1/assets/...` | Figures, diagrams, supplementary tables. |

## Editorial discipline

- **One authored Markdown source per file.** No frontmatter is required;
  the renderer infers title + date from the first H1 and the `Date:` line.
- **The article is for the generalist reader.** The report is for the
  technically curious — it includes empirical claims and a reproducibility
  recipe. Both are tenet-aligned to `spec/00-Tenets.md`.
- **No claim that isn't in the report.** Article claims defer to report
  evidence; both defer to the spec in turn (`spec/02-ReactorHarness.md`).

## Versioning

Future releases get their own subdirectory under `docs/reactor/`:

- `docs/reactor/v0.1/` (this directory) — pins to the v0.1.0 release.
- `docs/reactor/v0.2/` (future) — published with the v0.2 release.

The Astro app routes by version (`/reactor/v0.1/...`, `/reactor/v0.2/...`)
so prior versions stay reachable at their original URLs.

## How edits get published

1. Edit a file in this directory; commit to `openprose/prose`.
2. In `openprose/platform`, bump the `external/prose` submodule pin
   (`git submodule update --remote external/prose` then commit the SHA).
3. Deploy the `reports` Astro app via fly.io (`fly deploy` from
   `apps/reports/`).
4. The new version is live at `reports.openprose.ai`.

Local development: see the `apps/reports/` README in `openprose/platform`
for the dev-override that points the content path at a sibling
`openprose/prose` working tree instead of the pinned submodule.

## Publish-gate checklist (carried over from the technical-report plan)

The report draft was authored against rc.2; before flipping
`reports.openprose.ai` live, the maintainer team should confirm:

- [ ] §9 test counts refreshed against the `reactor-v0.1.0` green-gate
      (rc.2 audience-validation found `pnpm test` → 560, not the
      rc.1-cited 595 — release notes should reconcile).
- [ ] Every `blob/reactor-v0.1.0-rc.2/...` permalink in the report bumped
      to `blob/reactor-v0.1.0/...`.
- [ ] N14 (fulfillment exactly-once) wording in §5/§7b reflects the
      *resolved-by-scope* posture confirmed by the rc.2 validation pass
      (v0.1 ships no live fulfillment dispatcher; the next release that
      ships one must land the WAL/intent-record with it — `plans/2026-05-23-reactor-v0.1.x/PLAN.md` §D4).
- [ ] Figures (if any) render correctly from the Astro app and are
      pinned to a stable commit.
- [ ] One outside reader summarizes the final draft (audit gate from the
      report's authoring plan).
