---
name: habit-miner
kind: program
services: [scout, parser, miner, qualifier, author, organizer]
---

requires:
- mode: "full" (analyze everything), "incremental" (new logs only), or "check" (inventory only)
- min-frequency: minimum times a pattern must appear to qualify (default: 3)
- focus: filter to specific area, e.g., "git", "testing" (optional)

ensures:
- result: generated .prose programs for mature workflow patterns, organized by domain
- if mode is check: inventory of available log sources
- if no patterns are ready: status report with maturity update

strategies:
- when pattern is still emerging (3-5 hits): note it but do not automate yet
- when pattern is established (6-15 hits): good automation candidate
- when pattern is proven (16+ hits): strong automation candidate
- when pattern is declining: may be obsolete, skip
