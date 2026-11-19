#!/usr/bin/env python3
"""Fail only on model changes without a migration that are not already known on main.

Reads the output of `python manage.py makemigrations --check --dry-run` and
compares the operations it lists with a known-drift file, one
`<app>: <operation>` per line (`#` comments allowed). File names of the
would-be migrations are ignored, because their numbers change between branches.

  check_migrations.py makemigrations.txt --exit-code N --known tests/known_migration_drift.txt

Exit codes: 0 nothing new, 1 new drift or makemigrations crashed, 2 files unreadable.
Never add a line to the known-drift file to hide a change you made: add the migration.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

APP_LINE = re.compile(r"^Migrations for '([^']+)':\s*$")
OP_LINE = re.compile(r"^\s+[-~+*]\s+(.*\S)\s*$")


def parse_operations(text: str) -> list[str]:
    operations, app = [], None
    for line in text.splitlines():
        match = APP_LINE.match(line)
        if match:
            app = match.group(1)
            continue
        if app is None:
            continue
        match = OP_LINE.match(line)
        if match:
            operations.append(f"{app}: {match.group(1)}")
        elif line.strip() and not line.startswith(" "):
            app = None
    return operations


def load_known(path: Path) -> list[str]:
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if line:
            lines.append(line)
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output", type=Path, help="captured makemigrations --check --dry-run output")
    parser.add_argument("--exit-code", type=int, required=True, help="exit code of makemigrations")
    parser.add_argument("--known", type=Path, required=True)
    parser.add_argument("--summary-json", type=Path)
    args = parser.parse_args(argv)

    try:
        text = args.output.read_text(encoding="utf-8", errors="replace")
        known = load_known(args.known)
    except OSError as exc:
        print(f"Cannot read input: {exc}", file=sys.stderr)
        return 2

    operations = parse_operations(text)
    crashed = args.exit_code != 0 and not operations
    known_set, current_set = set(known), set(operations)
    new = [op for op in operations if op not in known_set]
    gone = [op for op in known if op not in current_set]

    if crashed:
        print(f"makemigrations exited with {args.exit_code} without listing changes (crash?):")
        print(text[-3000:])
    else:
        print(f"{len(operations)} pending operations ({len(operations) - len(new)} known on main, {len(new)} new)")
    for op in new:
        print(f"  NEW {op}")
    if gone:
        print("Known drift that no longer appears (remove from the known-drift file):")
        for op in gone:
            print(f"  - {op}")

    if args.summary_json:
        args.summary_json.write_text(
            json.dumps({"pending": len(operations), "new": new, "known_gone": gone, "crashed": crashed}, indent=2)
        )
    return 1 if crashed or new else 0


if __name__ == "__main__":
    sys.exit(main())
