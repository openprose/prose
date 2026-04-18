#!/usr/bin/env python3
"""Shim driving pi-mono as the LongCoT inference harness."""

import argparse
import json
import os
import random
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
THINKING_CHOICES = ["off", "minimal", "low", "medium", "high", "xhigh"]
DOMAIN_CHOICES = ["logic", "cs", "chemistry", "chess", "math", "all"]
DIFFICULTY_CHOICES = list(DIFFICULTY_ALIASES.keys())

MAX_ATTEMPTS = 3


def parse_args():
    p = argparse.ArgumentParser(description="Drive pi-mono for the LongCoT benchmark.")
    p.add_argument("--model", required=True)
    p.add_argument("--thinking", default="high", choices=THINKING_CHOICES)
    p.add_argument("--domain", default="all", choices=DOMAIN_CHOICES)
    p.add_argument("--difficulty", default="longcot", choices=DIFFICULTY_CHOICES)
    p.add_argument("--max-questions", type=int, default=0)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--system-prompt", default="You are a helpful assistant.")
    p.add_argument("--output", default=None)
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
    diff_label = difficulty
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    fname = f"{domain_label}_{diff_label}_{model_slug(model)}_{ts}.jsonl"
    return Path("responses") / fname


def load_all_questions(domains: list[str], difficulties: list[str]):
    import longcot  # noqa: WPS433 — deferred so --help works without it

    questions = []
    for d in domains:
        for diff in difficulties:
            questions.extend(longcot.load_questions(domain=d, difficulty=diff))
    return questions


def pi_command(model: str, thinking: str, system_prompt: str) -> list[str]:
    return [
        "pi",
        "--mode",
        "json",
        "--model",
        model,
        "--thinking",
        thinking,
        "--no-tools",
        "--no-skills",
        "--no-extensions",
        "--no-context-files",
        "--no-session",
        "--system-prompt",
        system_prompt,
    ]


def extract_prompt(q) -> str:
    # longcot question objects expose .prompt or are dicts with "prompt" / "question"
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


def reshape_usage(pi_usage: dict, thinking_chars: int) -> dict:
    input_tokens = int(pi_usage.get("input", 0) or 0)
    output_tokens = int(pi_usage.get("output", 0) or 0)
    # pi sometimes reports reasoning tokens separately; fall back to a char/4 estimate
    reasoning_tokens = pi_usage.get("reasoning")
    if reasoning_tokens is None:
        reasoning_tokens = thinking_chars // 4 if thinking_chars else 0
    return {
        "prompt_tokens": input_tokens,
        "completion_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "reasoning_tokens": int(reasoning_tokens),
    }


def run_pi_once(cmd: list[str], prompt: str) -> tuple[dict | None, list[dict]]:
    """Run pi once. Returns (parsed_result, errors). parsed_result is None on failure."""
    errors: list[dict] = []
    try:
        proc = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as e:
        errors.append({"type": "MissingBinary", "message": str(e), "status_code": None, "transient": False})
        return None, errors
    except Exception as e:  # noqa: BLE001
        errors.append({"type": "SubprocessError", "message": str(e), "status_code": None, "transient": True})
        return None, errors

    if proc.returncode != 0:
        stderr_tail = (proc.stderr or "").strip().splitlines()[-10:]
        errors.append({
            "type": "ExitNonZero",
            "message": f"pi exited {proc.returncode}: {' | '.join(stderr_tail)}",
            "status_code": proc.returncode,
            "transient": True,
        })
        return None, errors

    message_end = None
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError as e:
            errors.append({
                "type": "ParseError",
                "message": f"bad JSONL line: {e}",
                "status_code": None,
                "transient": True,
            })
            return None, errors
        if isinstance(ev, dict) and ev.get("type") == "message_end":
            message_end = ev

    if message_end is None:
        errors.append({
            "type": "NoMessageEnd",
            "message": "pi produced no message_end event",
            "status_code": None,
            "transient": True,
        })
        return None, errors

    message = message_end.get("message") or {}
    content = message.get("content") or []
    if not isinstance(content, list):
        errors.append({
            "type": "ParseError",
            "message": "message.content is not a list",
            "status_code": None,
            "transient": True,
        })
        return None, errors

    text_parts: list[str] = []
    thinking_parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        btext = block.get("text", "")
        if not isinstance(btext, str):
            continue
        if btype == "text":
            text_parts.append(btext)
        elif btype == "thinking":
            thinking_parts.append(btext)

    response_text = "".join(text_parts)
    reasoning = "".join(thinking_parts) if thinking_parts else None
    pi_usage = message.get("usage") or {}
    usage = reshape_usage(pi_usage, sum(len(t) for t in thinking_parts))

    return (
        {
            "response_text": response_text,
            "reasoning": reasoning,
            "usage": usage,
        },
        errors,
    )


def process_question(q, cmd: list[str], model: str) -> dict:
    qid = extract_qid(q)
    prompt = extract_prompt(q)
    all_errors: list[dict] = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        result, errs = run_pi_once(cmd, prompt)
        all_errors.extend(errs)
        if result is not None:
            line: dict = {
                "question_id": qid,
                "successful": True,
                "attempts": attempt,
                "response_text": result["response_text"],
                "model": model,
                "usage": result["usage"],
            }
            if result["reasoning"] is not None:
                line["reasoning"] = result["reasoning"]
            return line
    return {
        "question_id": qid,
        "successful": False,
        "attempts": MAX_ATTEMPTS,
        "errors": all_errors,
    }


def die(code: int, msg: str):
    print(msg, file=sys.stderr)
    sys.exit(code)


def main() -> int:
    args = parse_args()

    domains = resolve_domains(args.domain)
    difficulties = resolve_difficulties(args.difficulty)

    output_path = Path(args.output) if args.output else default_output_path(
        args.domain, args.difficulty, args.model,
    )

    cmd_template = pi_command(args.model, args.thinking, args.system_prompt)

    if args.dry_run:
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
        print("first 3 question_ids:")
        for q in questions[:3]:
            try:
                print(f"  {extract_qid(q)}")
            except Exception as e:  # noqa: BLE001
                print(f"  <unextractable: {e}>")
        print(f"resolved output path: {output_path}")
        print("pi command template:")
        print("  " + " ".join(repr(c) if " " in c else c for c in cmd_template))
        print("  (prompt supplied on stdin)")
        return 0

    if shutil.which("pi") is None:
        die(
            2,
            "pi binary not found on PATH. Install with: npm install -g @mariozechner/pi-coding-agent",
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

    write_lock = threading.Lock()
    completed = 0
    ok_count = 0
    err_count = 0
    total = len(questions)
    start = time.time()
    interrupted = {"flag": False}

    def handle_sigint(signum, frame):
        interrupted["flag"] = True
        # re-raise default behavior after cleanup via KeyboardInterrupt
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, handle_sigint)

    f = open(output_path, "w", encoding="utf-8")
    try:
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
            futures = {
                pool.submit(process_question, q, cmd_template, args.model): q
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
                    if completed % 10 == 0 or completed == total:
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
                # cancel pending
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
