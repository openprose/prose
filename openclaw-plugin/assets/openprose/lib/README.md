# OpenProse Standard Library

Local analysis and improvement programs that ship with OpenProse. Production-quality Prose v2 programs for evaluating runs, improving code, and managing persistent memory.

All programs use Prose v2 format (`.md`) with full contracts: `requires`, `ensures`, `errors`, `strategies`, and `invariants`. Multi-service programs define their services inline using `##` sections.

## Programs

### Evaluation & Analysis

| Program | Kind | Services | Description |
|---------|------|----------|-------------|
| `inspector.md` | program | index, extractor, evaluator, synthesizer | Post-run analysis for runtime fidelity and task effectiveness |
| `profiler.md` | program | detector, collector, calculator, analyzer, tracker | Cost, token, and time profiling from actual API session data |
| `cost-analyzer.md` | program | collector, analyzer, tracker | Token usage and cost pattern analysis |
| `calibrator.md` | program | sampler, comparator, statistician, advisor | Validates light evaluations against deep evaluations |
| `error-forensics.md` | program | investigator, classifier, fixer | Root cause analysis for failed or problematic runs |

### Improvement

| Program | Kind | Services | Description |
|---------|------|----------|-------------|
| `vm-improver.md` | program | analyst, researcher, implementer, pr-author | Proposes PRs to improve the VM spec based on inspection findings |
| `program-improver.md` | program | locator, analyst, implementer, pr-author | Proposes PRs to improve program source based on inspection findings |

### Memory

| Program | Kind | Persistence | Description |
|---------|------|-------------|-------------|
| `user-memory.md` | service | `persist: user` | Cross-project personal knowledge base at `~/.prose/agents/` |
| `project-memory.md` | service | `persist: project` | Project-scoped institutional memory at `.prose/agents/` |

## Usage

```bash
# Inspect a completed run
prose run lib/inspector.md --run-path .prose/runs/20260323-100000-abc123 --depth deep --target all

# Profile costs and performance
prose run lib/profiler.md --run-path recent --scope single

# Analyze cost patterns over time
prose run lib/cost-analyzer.md --run-path recent --scope trend

# Investigate a failed run
prose run lib/error-forensics.md --run-path .prose/runs/20260323-100000-abc123

# Calibrate light vs deep evaluations
prose run lib/calibrator.md --run-paths recent

# Memory services
prose run lib/user-memory.md --mode teach --content "prefer small focused services"
prose run lib/project-memory.md --mode query --content "what is the auth architecture?"
```

## The Improvement Loop

```
Run Program --> Inspector --> VM Improver --> PR (to prose spec)
                   |
                   v
            Program Improver --> PR (to program source)
```

Supporting analysis:
- **profiler** -- Detailed cost, time, and token profiling from actual session data
- **cost-analyzer** -- Where does the money go? Model tier efficiency and optimization targets
- **calibrator** -- Are cheap (light) evaluations reliable proxies for expensive (deep) ones?
- **error-forensics** -- Why did a run fail? Timeline, root cause, and fix recommendations
