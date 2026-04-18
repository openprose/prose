# LongCoT benchmark runner

This directory hosts the harness-under-test bridge between the **LongCoT** benchmark ([paper](https://arxiv.org/abs/2604.14140) · [repo](https://github.com/LongHorizonReasoning/longcot)) and our first candidate RLM harness, **pi-mono** (`@mariozechner/pi-coding-agent` — https://github.com/badlogic/pi-mono).

The GitHub Action lives at [`.github/workflows/longcot-bench.yml`](../../workflows/longcot-bench.yml). This README is how you invoke it and what the knobs mean.

---

## What it does

Per run, the workflow:

1. Clones LongCoT at the ref you pick, `uv sync`s its deps (includes `rdkit`, `chess`, `sympy`, the Python SDKs).
2. `npm i -g @mariozechner/pi-coding-agent@<pi_version>` to get the `pi` binary.
3. Runs `run_pi.py` (this directory) — our shim. For each selected question it shells out to:
   ```
   pi --mode json \
     --model <model> --thinking <thinking> \
     --no-tools --no-skills --no-extensions --no-context-files --no-session \
     --system-prompt "<system_prompt>"
   ```
   with the question prompt on stdin, parses the `message_end` JSONL event, and writes one line per question to `responses/*.jsonl` in the schema LongCoT's `run_eval.py` consumes.
4. Runs `uv run python run_eval.py responses/*.jsonl` (unless `run_eval=false`) to score against each domain's deterministic verifier.
5. Writes a summary table to the job summary and uploads `responses/` + `results/` as artifacts (30-day retention).

We use the library API (`longcot.load_questions`) rather than `run_inference.py`, and we use the paper's retry discipline (2 retries on API error = up to 3 attempts per question).

---

## How to trigger

GitHub UI → **Actions** tab → **LongCoT Benchmark** → **Run workflow**, pick inputs, go.

Or via `gh`:
```bash
gh workflow run longcot-bench.yml \
  -f model=anthropic/claude-opus-4-5 \
  -f difficulty=longcot-mini \
  -f max_questions=20
```

---

## Inputs

| input | default | notes |
|---|---|---|
| `model` | `anthropic/claude-opus-4-5` | pi model string. Examples: `openai/gpt-5.2`, `google/gemini-3-pro`, `openrouter/deepseek/deepseek-v3.2`. |
| `thinking` | `high` | `off` / `minimal` / `low` / `medium` / `high` / `xhigh`. Paper specifies "highest setting if available"; `xhigh` is literally pi's highest but `high` is the provider-native max for most APIs. |
| `domain` | `all` | or one of `logic`, `cs`, `chemistry`, `chess`, `math`. |
| `difficulty` | `longcot` | Paper-match: `longcot` = medium+hard, ~1995 q. Iteration-friendly: `longcot-mini` = easy, ~507 q. Also accepts `easy`/`medium`/`hard`/`all`. |
| `max_questions` | `0` | `0` means no cap. Slices after deterministic shuffle. |
| `offset` | `0` | Skip the first N questions after shuffle — handy for resuming. |
| `seed` | `0` | Shuffle seed. Same seed → same slice across runs. |
| `concurrency` | `8` | Parallel pi subprocesses. Matches LongCoT's default `num_workers`. |
| `system_prompt` | `You are a helpful assistant.` | Pi's default is a coding-agent prompt; we override so the model sees only the problem. |
| `pi_version` | `latest` | npm tag/version for `@mariozechner/pi-coding-agent`. Pin to a version (e.g. `0.5.1`) for reproducibility. |
| `longcot_ref` | `main` | Git ref of LongCoT repo (branch/tag/SHA). |
| `run_eval` | `true` | If `false`, produce responses JSONL but skip scoring. |
| `fallback_judge` | `true` | If `false`, pass `--no-fallback` to `run_eval.py` (disables Gemini judge for math/chem borderline cases). |

---

## During early iteration — use `longcot-mini`

The default (`longcot`) is set to match the paper's headline numbers for 1:1 comparison. A full `longcot` run is ~1995 questions × potentially tens of thousands of reasoning tokens each, and can push several hours of wall time.

**When iterating on the harness, set `difficulty=longcot-mini` and `max_questions=20` or so.** You'll get feedback in minutes, not hours.

```bash
# Fast smoke test while iterating:
gh workflow run longcot-bench.yml \
  -f model=anthropic/claude-opus-4-5 \
  -f difficulty=longcot-mini \
  -f max_questions=20 \
  -f concurrency=4
```

```bash
# Paper-match headline run — expect 3-4+ hours:
gh workflow run longcot-bench.yml \
  -f model=openai/gpt-5.2 \
  -f difficulty=longcot
```

---

## Paper fidelity

Defaults are calibrated to the LongCoT paper so our results are directly comparable to Tables 2-6 and Figure 4.

**Matching:**
- Single-shot, no pass@k / self-consistency.
- Provider-default temperature / top-p (pi-mono's CLI doesn't expose these; the paper uses "default" — consistent by omission).
- Highest reasoning effort available (`--thinking high`).
- No tools, no scaffolding, no context files, no skills.
- 2 independent retries on API errors.
- Deterministic per-domain verification, with optional LLM fallback for ambiguous math/chemistry cases.

**Known divergences (accepted for now):**
- **Max output tokens**: the paper lets models generate up to the provider's max (e.g. 128K for GPT 5.2). Pi-mono's CLI doesn't expose a `max_tokens` flag, so we inherit pi-ai's internal default. This may cap generation below the provider max for long-horizon traces. Revisit by either calling `@mariozechner/pi-ai` directly or upstreaming a pi CLI flag.
- **Fallback judge model**: the paper uses GPT-5-mini for ambiguous-case extraction; the LongCoT repo defaults to Gemini. We use the repo default (Gemini) for simplicity.
- **System prompt**: the paper doesn't specify one. We send `"You are a helpful assistant."` because pi's default is a coding-agent prompt and some form of override is required.

---

## Secrets the action reads

Set any of these as repo secrets (unset secrets are fine — only the provider you actually use needs to be present):

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `XAI_API_KEY`
- `GOOGLE_API_KEY` (also exposed as `GEMINI_API_KEY` for the LongCoT fallback judge)

---

## Artifacts

Every run uploads two artifacts (30-day retention):

- `longcot-responses-<run_id>` — the raw `responses/*.jsonl` (one line per question with `response_text`, `usage`, `reasoning`, errors).
- `longcot-results-<run_id>` — the scored `results/*.json` (totals, accuracy, `overall_accuracy`, per-question verdicts).

Download with `gh run download <run-id> -n longcot-results-<run_id>`.

---

## Running locally

You can run the shim outside GitHub Actions — useful for one-off debugging or running against your local `pi` install.

```bash
# 1. Clone LongCoT, set up its env
git clone https://github.com/LongHorizonReasoning/longcot
cd longcot
uv sync

# 2. Install pi
npm install -g @mariozechner/pi-coding-agent

# 3. Set a provider key
export ANTHROPIC_API_KEY=sk-ant-...

# 4. Run the shim (adjust the path to run_pi.py for your checkout)
uv run python /path/to/prose/.github/scripts/longcot/run_pi.py \
  --model anthropic/claude-opus-4-5 \
  --difficulty longcot-mini \
  --max-questions 5 \
  --concurrency 2

# 5. Score it
uv run python run_eval.py responses/<your-jsonl>
```

`--dry-run` on `run_pi.py` resolves the question list, prints the plan, and exits without calling pi — handy for verifying the slice before spending API budget.

---

## Swapping the harness under test

Pi-mono is the current subject. Replacing it means:

1. Swap the `npm install` step in the workflow for however the new harness installs.
2. Rewrite the per-question invocation inside `run_pi.py` — specifically `pi_command(...)` (the CLI) and `run_pi_once(...)` (the subprocess call + output parsing). The JSONL output schema (what `run_eval.py` consumes) stays the same.

Keeping `run_pi.py`'s input/output contract stable across harness changes is the whole point of this layout — harness-specific code is isolated to one function.
