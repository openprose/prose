#!/usr/bin/env python3
"""Shim driving rlmified pi as the LongCoT inference harness.

Mirrors run_pi.py's CLI surface but invokes `rlmify run` (transitively forking
pi) instead of pi directly. Thinking level is propagated to the nested pi
subprocess via the `RLMIFY_THINKING` env var (rlmify itself has no --thinking
flag); --system-prompt remains unavailable because rlmify composes its own HUD.
"""

import argparse
import json
import os
import random
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

DOMAINS_ALL = ["logic", "cs", "chemistry", "chess", "math"]
DIFFICULTY_ALIASES = {
    "longcot-mini": ["easy"],
    "longcot": ["medium", "hard"],
    "all": ["easy", "medium", "hard"],
    "easy": ["easy"],
    "medium": ["medium"],
    "hard": ["hard"],
}
DOMAIN_CHOICES = ["logic", "cs", "chemistry", "chess", "math", "all"]
DIFFICULTY_CHOICES = list(DIFFICULTY_ALIASES.keys())
THINKING_CHOICES = ["off", "minimal", "low", "medium", "high", "xhigh"]

PROGRAM_NAME = "solve_longcot_problem"
PROGRAMS_SUBPATH = Path("rfcs/005-rlm-harness/examples/longcot-solver/programs")
SKILL_SUBPATH = Path("skills/rlmify")

PROVIDER_KEY_ENV_VARS = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GROQ_API_KEY",
    "XAI_API_KEY",
    "MISTRAL_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
]


def parse_args():
    epilog = (
        "Note: --thinking is propagated to pi via the RLMIFY_THINKING env var "
        "(rlmify itself has no --thinking CLI flag — only env). --system-prompt "
        "remains unavailable because rlmify composes its own HUD. Model is "
        "passed via the RLMIFY_MODEL env var to rlmify (rlmify itself has no "
        "--model flag)."
    )
    p = argparse.ArgumentParser(
        description="Drive rlmified pi for the LongCoT benchmark.",
        epilog=epilog,
    )
    p.add_argument("--model", required=True)
    p.add_argument("--thinking", default="high", choices=THINKING_CHOICES)
    p.add_argument("--domain", default="all", choices=DOMAIN_CHOICES)
    p.add_argument("--difficulty", default="longcot", choices=DIFFICULTY_CHOICES)
    p.add_argument("--max-questions", type=int, default=0)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--concurrency", type=int, default=2)
    p.add_argument("--log-dir", required=True, type=Path)
    p.add_argument("--repo-root", default=None, type=Path)
    p.add_argument("--output", default=None)
    p.add_argument("--retries", type=int, default=0)
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def resolve_domains(domain: str) -> list[str]:
    return DOMAINS_ALL[:] if domain == "all" else [domain]


def resolve_difficulties(difficulty: str) -> list[str]:
    return DIFFICULTY_ALIASES[difficulty]


def model_slug(model: str) -> str:
    return model.replace("/", "_").replace(":", "_")


def default_output_path(domain: str, difficulty: str, model: str) -> Path:
    domain_label = "all" if domain == "all" else domain
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    fname = f"{domain_label}_{difficulty}_{model_slug(model)}_{ts}.jsonl"
    return Path("responses") / fname


def auto_repo_root() -> Path:
    # Walk up from this file until we find one containing skills/rlmify.
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / SKILL_SUBPATH).is_dir():
            return candidate
    # Fallback: three levels up matches the typical .github/scripts/longcot layout.
    return here.parents[3]


def load_all_questions(domains: list[str], difficulties: list[str]):
    import longcot  # noqa: WPS433 — deferred so --help works without it

    questions = []
    for d in domains:
        for diff in difficulties:
            questions.extend(longcot.load_questions(domain=d, difficulty=diff))
    return questions


def extract_prompt(q) -> str:
    for attr in ("prompt", "question", "text"):
        v = getattr(q, attr, None)
        if isinstance(v, str) and v:
            return v
    if isinstance(q, dict):
        for k in ("prompt", "question", "text"):
            v = q.get(k)
            if isinstance(v, str) and v:
                return v
    raise ValueError(f"cannot extract prompt from question: {q!r}")


def extract_qid(q) -> str:
    for attr in ("question_id", "id"):
        v = getattr(q, attr, None)
        if v is not None:
            return str(v)
    if isinstance(q, dict):
        for k in ("question_id", "id"):
            if k in q:
                return str(q[k])
    raise ValueError(f"cannot extract question_id from question: {q!r}")


def sanitize_qid(qid: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", qid)[:120]


def build_env(
    model: str,
    skill_path: Path,
    programs_path: Path,
    log_dir: Path,
    thinking: str,
) -> dict:
    env = os.environ.copy()
    env["RLMIFY_SKILL"] = str(skill_path)
    env["RLMIFY_PROGRAMS"] = str(programs_path)
    env["RLMIFY_LOG_DIR"] = str(log_dir)
    env["RLMIFY_MODEL"] = model
    # RLMIFY_THINKING is read by skills/rlmify/bin/src/lib/pi.ts and applied to
    # every pi subprocess in the tree (fallback inside pi.ts is "low").
    env["RLMIFY_THINKING"] = thinking
    # Prepend the rlmify bin to PATH so the root `rlmify` and nested spawns resolve.
    bin_dir = skill_path / "bin"
    env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH', '')}"
    # Provider keys are already inherited via os.environ.copy(); nothing extra to do.
    return env


def run_rlmify_once(
    prompt_file: Path,
    env: dict,
) -> tuple[subprocess.CompletedProcess | None, Exception | None]:
    try:
        proc = subprocess.run(
            [
                "rlmify",
                "run",
                "--registry-auto",
                PROGRAM_NAME,
                f"prompt_file={prompt_file}",
            ],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )
        return proc, None
    except Exception as e:  # noqa: BLE001
        return None, e


def parse_rlmify_output(stdout: str) -> tuple[dict | None, str | None]:
    """Return (delta_obj, error_type). error_type is None on success."""
    stripped = (stdout or "").strip()
    if not stripped:
        return None, "ParseError"
    try:
        obj = json.loads(stripped)
    except json.JSONDecodeError:
        return None, "ParseError"
    if not isinstance(obj, dict):
        return None, "ParseError"
    delta = obj.get("delta")
    if not isinstance(delta, dict):
        return None, "NoDelta"
    solution = delta.get("solution")
    if not isinstance(solution, str):
        return None, "MissingSolution"
    return obj, None


def process_question(
    q,
    model: str,
    skill_path: Path,
    programs_path: Path,
    base_log_dir: Path,
    retries: int,
    thinking: str,
) -> dict:
    qid = extract_qid(q)
    prompt = extract_prompt(q)
    safe_qid = sanitize_qid(qid)
    qdir = (base_log_dir / safe_qid).resolve()
    qdir.mkdir(parents=True, exist_ok=True)
    prompt_file = qdir / "prompt.txt"
    prompt_file.write_text(prompt, encoding="utf-8")

    env = build_env(model, skill_path, programs_path, qdir, thinking)

    max_attempts = 1 + max(0, retries)
    all_errors: list[dict] = []
    start = time.time()
    proc = None
    for attempt in range(1, max_attempts + 1):
        proc, spawn_err = run_rlmify_once(prompt_file, env)
        if spawn_err is not None:
            all_errors.append({
                "type": "SubprocessError",
                "message": str(spawn_err),
                "status_code": None,
                "transient": True,
            })
            break

        # Persist stderr for forensics.
        try:
            (qdir / "rlmify.stderr").write_text(proc.stderr or "", encoding="utf-8")
            (qdir / "rlmify.stdout").write_text(proc.stdout or "", encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass

        if proc.returncode != 0:
            stderr_tail = (proc.stderr or "").strip().splitlines()[-10:]
            all_errors.append({
                "type": "ExitNonZero",
                "message": f"rlmify exited {proc.returncode}: {' | '.join(stderr_tail)}",
                "status_code": proc.returncode,
                "transient": True,
            })
            # Retry only on ExitNonZero.
            if attempt < max_attempts:
                continue
            break

        delta_obj, err_type = parse_rlmify_output(proc.stdout)
        if delta_obj is not None:
            delta = delta_obj["delta"]
            solution = delta["solution"]
            # Schema mapping: we flatten rlmify's delta into run_eval.py's shape.
            # Usage fields are zeroed — rlmify v1 doesn't surface per-call token
            # counts (they live in pi's session.jsonl); not worth parsing for v1.
            line: dict = {
                "question_id": qid,
                "successful": True,
                "attempts": attempt,
                "response_text": f"solution = {solution}",
                "model": model,
                "usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                    "reasoning_tokens": 0,
                },
                "reasoning": None,
                "delta_status": delta_obj.get("status", "unknown"),
                "delta_summary": delta_obj.get("summary", ""),
                "log_dir": str(qdir),
                "wall_time_seconds": round(time.time() - start, 3),
            }
            return line

        # Parse/structure failure — do NOT retry (the model drifted).
        all_errors.append({
            "type": err_type or "ParseError",
            "message": f"rlmify stdout did not contain a valid delta.solution (type={err_type})",
            "status_code": None,
            "transient": False,
        })
        break

    return {
        "question_id": qid,
        "successful": False,
        "attempts": min(max_attempts, len(all_errors) or 1),
        "errors": all_errors,
        "log_dir": str(qdir),
        "wall_time_seconds": round(time.time() - start, 3),
    }


def die(code: int, msg: str):
    print(msg, file=sys.stderr)
    sys.exit(code)


def redact_env_map(env: dict) -> dict:
    out = {}
    for k, v in env.items():
        if k.endswith("_API_KEY"):
            out[k] = "<redacted>"
        else:
            out[k] = v
    return out


def main() -> int:
    args = parse_args()

    repo_root = args.repo_root.resolve() if args.repo_root else auto_repo_root()
    skill_path = (repo_root / SKILL_SUBPATH).resolve()
    programs_path = (repo_root / PROGRAMS_SUBPATH).resolve()
    base_log_dir = args.log_dir.resolve()

    if not skill_path.is_dir():
        die(2, f"rlmify skill directory not found: {skill_path}")
    program_file = programs_path / f"{PROGRAM_NAME}.md"
    if not program_file.is_file():
        die(2, f"program file not found: {program_file}")

    domains = resolve_domains(args.domain)
    difficulties = resolve_difficulties(args.difficulty)

    output_path = Path(args.output) if args.output else default_output_path(
        args.domain, args.difficulty, args.model,
    )

    if args.dry_run:
        try:
            questions = load_all_questions(domains, difficulties)
        except ImportError:
            questions = []
        rng = random.Random(args.seed)
        rng.shuffle(questions)
        if args.offset:
            questions = questions[args.offset:]
        if args.max_questions:
            questions = questions[: args.max_questions]

        breakdown: dict[tuple[str, str], int] = {}
        for d in domains:
            for diff in difficulties:
                try:
                    import longcot
                    breakdown[(d, diff)] = len(longcot.load_questions(domain=d, difficulty=diff))
                except Exception:  # noqa: BLE001
                    breakdown[(d, diff)] = -1

        print(f"total matched questions (post-filter): {len(questions)}")
        print("per-(domain,difficulty) breakdown:")
        for (d, diff), n in breakdown.items():
            print(f"  {d}/{diff}: {n}")
        print("first 3 question_ids (with prompt char length):")
        for q in questions[:3]:
            try:
                qid = extract_qid(q)
                pl = len(extract_prompt(q))
                print(f"  {qid} (prompt={pl} chars)")
            except Exception as e:  # noqa: BLE001
                print(f"  <unextractable: {e}>")
        print(f"resolved output path: {output_path}")
        print(f"resolved base log-dir: {base_log_dir}")
        print(f"resolved repo root: {repo_root}")
        print(f"resolved skill path: {skill_path}")
        print(f"resolved programs path: {programs_path}")
        print(f"resolved thinking level: {args.thinking} (exported as RLMIFY_THINKING)")

        sample_qdir = base_log_dir / "<question_id>"
        print("sample rlmify command:")
        print(
            f"  rlmify run --registry-auto {PROGRAM_NAME} "
            f"prompt_file={sample_qdir / 'prompt.txt'}"
        )

        sample_env = build_env(
            args.model, skill_path, programs_path, sample_qdir, args.thinking,
        )
        relevant = {k: sample_env[k] for k in (
            "RLMIFY_SKILL", "RLMIFY_PROGRAMS", "RLMIFY_LOG_DIR",
            "RLMIFY_MODEL", "RLMIFY_THINKING", "PATH",
        )}
        for k in PROVIDER_KEY_ENV_VARS:
            if k in sample_env:
                relevant[k] = sample_env[k]
        for k, v in redact_env_map(relevant).items():
            print(f"  {k}={v}")
        return 0

    if shutil.which("rlmify") is None and not (skill_path / "bin" / "rlmify").exists():
        die(
            2,
            "rlmify not found — ensure `$RLMIFY_SKILL/bin` is on PATH; "
            "install with `cd skills/rlmify/bin && bun install`",
        )

    try:
        questions = load_all_questions(domains, difficulties)
    except ImportError:
        die(2, "longcot package not installed. Install with: pip install longcot")

    rng = random.Random(args.seed)
    rng.shuffle(questions)
    if args.offset:
        questions = questions[args.offset:]
    if args.max_questions:
        questions = questions[: args.max_questions]

    if not questions:
        die(3, "no questions after applying filters")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    base_log_dir.mkdir(parents=True, exist_ok=True)

    write_lock = threading.Lock()
    completed = 0
    ok_count = 0
    err_count = 0
    total = len(questions)
    start = time.time()

    def handle_sigint(signum, frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, handle_sigint)

    f = open(output_path, "w", encoding="utf-8")
    try:
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
            futures = {
                pool.submit(
                    process_question,
                    q,
                    args.model,
                    skill_path,
                    programs_path,
                    base_log_dir,
                    args.retries,
                    args.thinking,
                ): q
                for q in questions
            }
            try:
                for fut in as_completed(futures):
                    line = fut.result()
                    with write_lock:
                        f.write(json.dumps(line, ensure_ascii=False) + "\n")
                        f.flush()
                    completed += 1
                    if line.get("successful"):
                        ok_count += 1
                    else:
                        err_count += 1
                    if completed % 5 == 0 or completed == total:
                        elapsed = time.time() - start
                        print(
                            f"[{completed}/{total}] ok={ok_count} err={err_count} "
                            f"elapsed={elapsed:.1f}s",
                            file=sys.stderr,
                        )
            except KeyboardInterrupt:
                print(
                    f"\ninterrupted: wrote {completed}/{total} "
                    f"(ok={ok_count}, err={err_count}) to {output_path}",
                    file=sys.stderr,
                )
                for pending in futures:
                    pending.cancel()
                return 130
    finally:
        f.close()

    elapsed = time.time() - start
    print(
        f"done: {completed}/{total} ok={ok_count} err={err_count} "
        f"elapsed={elapsed:.1f}s output={output_path}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
