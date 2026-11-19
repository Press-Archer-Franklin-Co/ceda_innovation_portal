#!/usr/bin/env python3
"""Compare an ESLint JSON report with a saved baseline and fail only on new problems.

A problem is identified by file, rule, severity and message, so it survives
lines moving around. A file may have the same problem several times; only the
count above the baseline is new.

  check:  check_lint_baseline.py eslint.json --baseline lint-baseline.json --root .
  write:  check_lint_baseline.py eslint.json --baseline lint-baseline.json --root . --write-baseline

Only write a baseline from the code on `main`. Never regenerate it to hide a
problem a change introduced.

Exit codes: 0 no new problems, 1 new problems, 2 report or baseline unreadable.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

SEVERITY = {1: "warning", 2: "error"}


def load_report(path: Path, root: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    problems = []
    for file_result in data:
        rel = Path(os.path.relpath(file_result["filePath"], root.resolve())).as_posix()
        for message in file_result.get("messages", []):
            problems.append(
                {
                    "file": rel,
                    "rule": message.get("ruleId") or "parse-error",
                    "severity": SEVERITY.get(message.get("severity"), "error"),
                    "message": message.get("message", ""),
                    "line": message.get("line"),
                }
            )
    return problems


def key(problem: dict) -> tuple:
    return (problem["file"], problem["rule"], problem["severity"], problem["message"])


def totals(problems: list[dict]) -> dict:
    counts = Counter(p["severity"] for p in problems)
    return {"errors": counts.get("error", 0), "warnings": counts.get("warning", 0)}


def write_baseline(problems: list[dict], path: Path) -> None:
    counts = Counter(key(p) for p in problems)
    entries = [
        {"file": f, "rule": r, "severity": s, "message": m, "count": c}
        for (f, r, s, m), c in sorted(counts.items())
    ]
    path.write_text(json.dumps({"totals": totals(problems), "problems": entries}, indent=2) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("report", type=Path, help="ESLint report from --format json")
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path("."), help="directory ESLint ran from")
    parser.add_argument("--write-baseline", action="store_true")
    parser.add_argument("--summary-json", type=Path)
    args = parser.parse_args(argv)

    try:
        problems = load_report(args.report, args.root)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Cannot read ESLint report {args.report}: {exc}", file=sys.stderr)
        if args.summary_json:
            args.summary_json.write_text(json.dumps({"error": f"Cannot read ESLint report: {exc}"}, indent=2))
        return 2

    if args.write_baseline:
        write_baseline(problems, args.baseline)
        t = totals(problems)
        print(f"Wrote {args.baseline}: {t['errors']} errors, {t['warnings']} warnings")
        return 0

    try:
        baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"Cannot read lint baseline {args.baseline}: {exc}", file=sys.stderr)
        if args.summary_json:
            args.summary_json.write_text(json.dumps({"error": f"Cannot read lint baseline: {exc}"}, indent=2))
        return 2

    allowed = Counter()
    for entry in baseline.get("problems", []):
        allowed[(entry["file"], entry["rule"], entry["severity"], entry["message"])] += int(entry.get("count", 1))

    by_key: dict[tuple, list[dict]] = {}
    for problem in problems:
        by_key.setdefault(key(problem), []).append(problem)

    new_problems = []
    for k, items in sorted(by_key.items()):
        extra = len(items) - allowed.get(k, 0)
        if extra > 0:
            # Which occurrences are "new" is ambiguous; report the last ones.
            new_problems.extend(sorted(items, key=lambda p: p["line"] or 0)[-extra:])
    fixed = sum(max(0, count - len(by_key.get(k, []))) for k, count in allowed.items())

    current = totals(problems)
    new_totals = totals(new_problems)
    print(
        f"{current['errors']} errors, {current['warnings']} warnings; "
        f"{len(new_problems)} new vs baseline ({new_totals['errors']} errors, {new_totals['warnings']} warnings); "
        f"{fixed} baseline problems gone"
    )
    for p in new_problems:
        print(f"  NEW {p['severity']}: {p['file']}:{p['line']} {p['rule']}: {p['message']}")
    if fixed:
        print("Some baseline problems are fixed. Regenerate the baseline from main after merging to lock that in.")

    if args.summary_json:
        args.summary_json.write_text(
            json.dumps(
                {
                    "errors": current["errors"],
                    "warnings": current["warnings"],
                    "new": [
                        {k: p[k] for k in ("file", "line", "rule", "severity", "message")} for p in new_problems
                    ],
                    "baseline_fixed": fixed,
                },
                indent=2,
            )
        )
    return 1 if new_problems else 0


if __name__ == "__main__":
    sys.exit(main())
