# Sample outputs

Real outputs from running `grant-radar` against the three example briefs.
Captured 2026-05-13 against live Grants.gov, Federal Register, public agency
RSS sources, and configured public source pages.

Each example directory contains the six bindings in execution order:

```
01-startup_brief.md          # the human-language brief (caller input; legacy binding name)
02-research_assignment.md    # resolved Research Assignment JSON
03-research_packet.md        # deterministic grant-finder candidate packet
04-ranked_recommendations.md # agent review: selected + rejected candidates
05-top_pick_explanations.md  # per-selected-candidate evidence + provenance
06-markdown_report.md        # final human-readable report
```

## What to look at first

**For each example, open `06-markdown_report.md`** — that's the human-readable
artifact at the end of the chain. The other files are structured intermediate
bindings.

## The three examples

| Example | Brief | Outcome |
|---|---|---|
| [`polyspectra/`](./polyspectra/) | US small business making rugged photopolymer resins for industrial 3D printing | NSF Seed Fund manufacturing/materials, America Makes, and NASA materials leads surface; broad defense/energy records are rejected |
| [`cypris/`](./cypris/) | Berkeley-based advanced materials company developing structural color coatings | NSF Seed Fund photonics, chemical technologies, advanced materials, and EPA SBIR surface; false structural-biology/manufacturing matches are rejected |
| [`enact-lab/`](./enact-lab/) | Yale academic clinical psychiatry lab studying psychedelics | NIH psilocybin highlighted topic, NIH PAR mechanisms, and CDMRP watch lane surface; SBIR/STTR remains rejected |

## The boundary this sample demonstrates

The CLI output is a deterministic candidate packet, not the final judgment.
`rank-opportunities.prose.md` reads the full assignment, rejects weak
or contraindicated candidates, and may publish `no_good_matches: true`. That is
intentional: the agent has the context needed to make the recommendation call.

## All three runs proved `no_llm: true`

Every `research_packet.md` and every record in `top_pick_explanations.md`
carries `no_llm: true`. The drift guard in `run-research.prose.md` and
`explain-top-picks.prose.md` would have rejected any record that didn't.

## Reproducing these outputs

```bash
# Recommended (granular sandbox, requires patched prose CLI):
PROSE_CODEX_SANDBOX_MODE=workspace-write \
PROSE_CODEX_APPROVAL_POLICY=never \
PROSE_CODEX_ADD_DIR=$HOME/.local/share/grant-finder \
PROSE_CODEX_NETWORK=true \
prose run src/grant-radar.prose.md \
  --startup_brief "$(cat fixtures/polyspectra.brief.txt)"

# Fallback (any prose version):
PROSE_CODEX_SANDBOX_MODE=danger-full-access \
PROSE_CODEX_APPROVAL_POLICY=never \
prose run src/grant-radar.prose.md \
  --startup_brief "$(cat fixtures/polyspectra.brief.txt)"
```

Your live outputs will differ from these samples — Grants.gov posts and
closes opportunities every week, so the candidate set and deadlines shift.
The report should still either recommend evidence-backed opportunities or say
clearly that no good match was found.
