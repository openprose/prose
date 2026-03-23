# OpenProse Standard Library

Local analysis and improvement programs that ship with OpenProse. Production-quality programs for evaluating runs, improving code, and managing memory.

Programs are available in both v2 (`.md`) and legacy v1 (`.prose`) formats. The v2 versions are the canonical format going forward.

## Programs

### Evaluation & Improvement

| Program | Description |
|---------|-------------|
| `inspector.md` | Post-run analysis for runtime fidelity and task effectiveness |
| `vm-improver.md` | Analyzes inspections and proposes PRs to improve the VM |
| `program-improver.md` | Analyzes inspections and proposes PRs to improve .prose source |
| `cost-analyzer.md` | Token usage and cost pattern analysis |
| `calibrator.md` | Validates light evaluations against deep evaluations |
| `profiler.md` | Cost, token usage, and time profiling for completed runs |
| `error-forensics.md` | Root cause analysis for failed runs |

### Memory

| Program | Description |
|---------|-------------|
| `user-memory.md` | Cross-project persistent personal memory (`persist: user`) |
| `project-memory.md` | Project-scoped institutional memory (`persist: project`) |

## Usage

```bash
# Inspect a completed run
prose run lib/inspector.md

# Analyze costs
prose run lib/cost-analyzer.md

# Investigate failures
prose run lib/error-forensics.md

# Memory programs (recommend sqlite+ backend)
prose run lib/user-memory.md --backend sqlite+
prose run lib/project-memory.md --backend sqlite+
```

## The Improvement Loop

```
Run Program -> Inspector -> VM Improver -> PR
                   |
                   v
            Program Improver -> PR
```

Supporting analysis:
- **cost-analyzer** -- Where does the money go?
- **calibrator** -- Are cheap evaluations reliable proxies for expensive ones?
- **error-forensics** -- Why did a run fail?
- **profiler** -- Detailed cost, time, and token profiling from actual API data
